#!/usr/bin/env node
/**
 * sparkDash Exporter — runs on each DGX Spark node.
 *
 * Two roles:
 *   1. SSH server — allows sparkdash to execute allowlisted metric-collecting
 *      commands (gpu-metrics, cpu-metrics, memory-metrics, network-metrics,
 *      storage-metrics, llm-metrics, system-info, probe).
 *   2. Local HTTP server — exposes /metrics in Prometheus text format so
 *      any scraper can pull without needing SSH credentials.
 *
 * The exporter also optionally reads wall-power meters (Home Assistant) from
 * a config file, exposing sparkdash_wall_power_watts in Prometheus output.
 *
 * No SSH/GPU deps on the dashboard host — the exporter runs on the node itself.
 */

import { Server } from "ssh2";
import { createServer } from "http";
import { renderMetrics } from "./metrics.js";
import { collectGpu, collectCpu, collectMemory, collectNetwork, collectStorage, collectLlm, collectSystemInfo } from "./collectors.js";
import { PowerMeterTracker } from "./powermeter.js";

const SSH_PORT = parseInt(process.env.ESPORT || "2222", 10) || 2222;
const HTTP_PORT = parseInt(process.env.METRICS_PORT || "9100", 10) || 9100;

// ─── Power meter tracker ─────────────────────────────────────

const POWER_METERS_CONFIG = process.env.ES_POWER_METERS_CONFIG;
let powerTracker = null;

if (POWER_METERS_CONFIG) {
  try {
    powerTracker = new PowerMeterTracker(POWER_METERS_CONFIG);
    powerTracker.start();
  } catch (err) {
    console.error("[exporter] Power meter config error:", err.message);
  }
}

// ─── SSH Server ──────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  "gpu-metrics", "cpu-metrics", "memory-metrics",
  "network-metrics", "storage-metrics", "llm-metrics",
  "system-info", "probe",
]);

let hostKeyPath = process.env.ES_SSH_HOST_KEY;
if (!hostKeyPath) {
  // Default: generate a host key if none provided
  hostKeyPath = null;
}

const sshd = new Server({
  hostKeys: hostKeyPath ? [hostKeyPath] : undefined,
}, (client) => {
  client.on("authentication", (ctx) => {
    if (ctx.method === "publickey") {
      if (ctx.key.algo === "ssh-ed25519" || ctx.key.algo === "rsa-sha2-256" || ctx.key.algo === "rsa-sha2-512") {
        return ctx.accept();
      }
    }
    if (ctx.method === "password" && process.env.ES_ACCEPT_PASSWORD === "1") {
      return ctx.accept();
    }
    ctx.reject();
  });

  client.on("ready", () => {
    console.log(`[exporter] Client authenticated: ${client.username}`);
  });

  client.on("session", (accept) => {
    const session = accept();

    session.on("exec", (accept, reject, payload) => {
      const cmd = payload.data;
      if (!ALLOWED_COMMANDS.has(cmd)) {
        return reject(new Error(`Command not allowed: ${cmd}. Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`));
      }

      (async () => {
        try {
          let result;
          switch (cmd) {
            case "probe":
              result = JSON.stringify({ status: "ok", uptime: process.uptime() });
              break;
            case "gpu-metrics":
              result = JSON.stringify(await collectGpu());
              break;
            case "cpu-metrics":
              result = JSON.stringify(await collectCpu());
              break;
            case "memory-metrics":
              result = JSON.stringify(await collectMemory());
              break;
            case "network-metrics":
              result = JSON.stringify(await collectNetwork());
              break;
            case "storage-metrics":
              result = JSON.stringify(await collectStorage());
              break;
            case "llm-metrics":
              result = JSON.stringify(await collectLlm());
              break;
            case "system-info":
              result = JSON.stringify(await collectSystemInfo());
              break;
            default:
              return reject(new Error(`Unknown command: ${cmd}`));
          }
          accept({ exitStatus: 0 });
          setTimeout(() => {
            session._chan.stdin?.write(result + "\n");
            session._chan.end();
          }, 0);
        } catch (err) {
          console.error(`[exporter] Command ${cmd} failed:`, err.message);
          accept({ exitStatus: 1 });
          setTimeout(() => {
            session._chan.stdin?.write(JSON.stringify({ error: err.message }) + "\n");
            session._chan.end();
          }, 0);
        }
      })();
    });
  });
});

// ─── HTTP /metrics endpoint ─────────────────────────────────

const httpServer = createServer(async (req, res) => {
  if (req.url === "/metrics" && req.method === "GET") {
    const startTime = Date.now();
    const entries = [];

    try {
      const [gpu, cpu, memory, network, storage, llm, system] = await Promise.allSettled([
        collectGpu(), collectCpu(), collectMemory(),
        collectNetwork(), collectStorage(), collectLlm(), collectSystemInfo(),
      ]);

      entries.push({
        id: "local",
        name: system.status === "fulfilled"
          ? `spark-${system.value?.hostname || "node"}`
          : "local-node",
        kind: "spark",
        online: true,
        metrics: {
          gpu: gpu.status === "fulfilled" ? gpu.value : null,
          cpu: cpu.status === "fulfilled" ? cpu.value : null,
          ram: memory.status === "fulfilled" ? memory.value : null,
          network: network.status === "fulfilled" ? network.value : null,
          storage: storage.status === "fulfilled" ? storage.value : null,
          llm: llm.status === "fulfilled" ? llm.value : null,
        },
      });
    } catch (err) {
      console.error("[exporter] Metrics collection failed:", err.message);
    }

    // Add wall power meters
    if (powerTracker) {
      const meterData = powerTracker.getMetersForPrometheus();
      entries[0].powerMeters = meterData;
    }

    const metrics = renderMetrics(entries);
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(metrics);
    console.log(`[exporter] /metrics served in ${Date.now() - startTime}ms`);
  } else if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("sparkDash Exporter — /metrics or /health\n");
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ─── Graceful shutdown ──────────────────────────────────────

function shutdown(sig) {
  console.log(`[exporter] ${sig} received, shutting down…`);
  if (powerTracker) powerTracker.stop();
  sshd.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Start ──────────────────────────────────────────────────

Promise.all([
  new Promise((resolve, reject) => {
    sshd.listen(SSH_PORT, "0.0.0.0", () => {
      console.log(`[exporter] SSH server listening on port ${SSH_PORT}`);
      resolve();
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE" && SSH_PORT === 22) {
        console.error("[exporter] Port 22 already in use — set ESPORT to a different port");
        reject(err);
      } else reject(err);
    });
  }),
  new Promise((resolve, reject) => {
    httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
      console.log(`[exporter] HTTP /metrics on port ${HTTP_PORT}`);
      resolve();
    }).on("error", reject);
  }),
]).catch((err) => {
  console.error("[exporter] Failed to start:", err.message);
  process.exit(1);
});
