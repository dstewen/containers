/**
 * Collectors — read metrics from the DGX Spark node itself.
 * All collectors run locally (no SSH required) so the exporter exposes
 * /metrics without remote credentials.
 */

import { execFile } from "child_process";
import { readFileSync, existsSync } from "fs";
import { promisify } from "util";

const exec = promisify(execFile);

/** Parse nvidia-smi numeric field; treat [N/A] / empty as null. */
function parseSmiNumber(value) {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t || /^\[?n\/a\]?$/i.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** MIB to bytes */
const MIB = 1024 * 1024;

export async function collectGpu() {
  try {
    const [gpuOut, memOut, computeOut] = await Promise.all([
      exec("nvidia-smi", [
        "--query-gpu=temperature.gpu,utilization.gpu,power.draw,power.limit,clocks.current.sm,clocks.max.sm,clocks_throttle_reasons.hw_thermal_slowdown,clocks_throttle_reasons.sw_thermal_slowdown,clocks_throttle_reasons.hw_slowdown,clocks_throttle_reasons.sw_power_cap,index,name,uuid",
        "--format=csv,noheader,nounits",
      ], { timeout: 5000 }),
      exec("nvidia-smi", [
        "--query-gpu=memory.used,memory.total",
        "--format=csv,noheader,nounits",
      ], { timeout: 5000 }),
      exec("nvidia-smi", [
        "--query-compute-apps=pid,process_name,used_gpu_memory,gpu_uuid",
        "--format=csv,noheader,nounits",
      ], { timeout: 5000 }),
    ]);

    const gpuLines = gpuOut.stdout.trim().split("\n").filter(Boolean);
    const memLines = memOut.stdout.trim().split("\n").filter(Boolean);
    const computeLines = computeOut.stdout.trim().split("\n").filter(Boolean);

    let temp = 0, usage = 0, powerDraw = 0, powerLimit = 120;
    let throttle = { thermal: false, hwSlowdown: false, powerCap: false, active: false, reason: "ok" };

    for (const line of gpuLines) {
      const parts = line.split(",").map(s => s.trim());
      temp = Math.max(temp, parseFloat(parts[0]) || 0);
      usage = Math.max(usage, parseFloat(parts[1]) || 0);
      powerDraw += parseFloat(parts[2]) || 0;
      powerLimit += parseSmiNumber(parts[3]) ?? 120;

      const tf = [
        { key: "thermal", value: parts[6] },
        { key: "hwSlowdown", value: parts[8] },
        { key: "powerCap", value: parts[9] },
      ];
      for (const t of tf) {
        if (t.value && /^active$/i.test(t.value)) {
          throttle[t.key] = true;
          throttle.active = true;
          throttle.reason = t.key === "thermal" ? "thermal" : t.key === "powerCap" ? "power" : "hw";
        }
      }
    }

    const apps = computeLines.map(line => {
      const [pid, name, vram] = line.split(",").map(s => s.trim());
      return { pid: parseInt(pid) || 0, name, vramMB: parseSmiNumber(vram) || 0 };
    }).filter(a => a.pid > 0);

    let vramUsed = 0, vramTotal = 0;
    for (const line of memLines) {
      const [used, total] = line.split(",").map(s => s.trim());
      vramUsed += parseSmiNumber(used) || 0;
      vramTotal += parseSmiNumber(total) || 0;
    }

    const computeSum = apps.reduce((s, a) => s + a.vramMB, 0);
    const usedVram = Math.max(vramUsed, computeSum);

    const topApps = apps.sort((a, b) => b.vramMB - a.vramMB).slice(0, 5)
      .map(a => ({ pid: a.pid, name: a.name, vramMB: a.vramMB }));

    return {
      temperature: temp,
      usage: gpuLines.length ? (usage / gpuLines.length) : 0,
      power: { draw: Math.round(powerDraw * 10) / 10, limit: Math.round(powerLimit * 10) / 10 },
      vram: {
        used: Math.round(usedVram),
        total: Math.round(vramTotal),
        percentage: vramTotal > 0 ? Math.round((usedVram / vramTotal) * 100) : 0,
        available: Math.max(0, vramTotal - usedVram),
      },
      processes: topApps,
      throttle,
      gpuCount: gpuLines.length,
    };
  } catch (err) {
    return { temperature: 0, usage: 0, power: { draw: 0, limit: 0 }, vram: { used: 0, total: 0, percentage: 0, available: 0 }, processes: [], throttle: { reason: "ok" }, gpuCount: 0, error: err.message };
  }
}

export async function collectCpu() {
  try {
    const raw = readFileSync("/proc/stat", "utf-8");
    const cpuLine = raw.split("\n").find(l => l.startsWith("cpu "));
    if (!cpuLine) return { usage: 0, temperature: 0, draw: 0, tdp: 0 };

    const parts = cpuLine.split(/\s+/).slice(1).map(Number);
    const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
    const total = user + nice + system + idle + iowait + irq + softirq + steal;
    const used = total - idle - iowait;
    const usagePct = total > 0 ? Math.round((used / total) * 100) : 0;

    // CPU temperature from hwmon or thermal zones
    let temperature = 0;
    let temperatureSource = null;

    // Try hwmon
    const hwmonCandidates = ["coretemp", "k10temp", "zenpower", "x86_pkg_temp", "cpu-thermal"];
    try {
      const hwmonDir = "/sys/class/hwmon";
      if (existsSync(hwmonDir)) {
        const entries = readdirSync(hwmonDir);
        for (const entry of entries) {
          const nameFile = `${hwmonDir}/${entry}/name`;
          if (!existsSync(nameFile)) continue;
          const name = readFileSync(nameFile, "utf-8").trim();
          if (!hwmonCandidates.includes(name)) continue;
          const dir = `${hwmonDir}/${entry}`;
          const tempFiles = readdirSync(dir).filter(f => f.startsWith("temp") && f.endsWith("_input")).sort()[0];
          if (tempFiles) {
            const rawTemp = parseInt(readFileSync(`${dir}/${tempFiles}`, "utf-8").trim());
            if (rawTemp > 0) temperature = Math.round(rawTemp / 1000 * 10) / 10;
            temperatureSource = name;
          }
        }
      }
    } catch { /* ignore hwmon errors */ }

    // ARM/Neoverse TDP is 65W, x86 fallback is 185W
    const isArm = raw.includes("aarch64") || raw.includes("ARM");
    const tdp = isArm ? 65 : 185;
    const frac = usagePct / 100;
    const draw = Math.round((tdp * 0.08 + (tdp - tdp * 0.08) * frac) * 10) / 10;

    return {
      usage: usagePct,
      temperature,
      temperatureSource,
      draw,
      tdp,
    };
  } catch (err) {
    return { usage: 0, temperature: 0, temperatureSource: null, draw: 0, tdp: 0, error: err.message };
  }
}

export async function collectMemory() {
  try {
    const raw = readFileSync("/proc/meminfo", "utf-8");
    const totalMatch = raw.match(/MemTotal:\s+(\d+)\s+kB/);
    const availMatch = raw.match(/MemAvailable:\s+(\d+)\s+kB/);
    const totalKB = totalMatch ? parseInt(totalMatch[1]) : 0;
    const availKB = availMatch ? parseInt(availMatch[1]) : 0;
    const usedKB = totalKB - availKB;

    return {
      total: Math.round(totalKB / 1024),
      used: Math.round(usedKB / 1024),
      available: Math.round(availKB / 1024),
      percentage: totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0,
    };
  } catch (err) {
    return { total: 0, used: 0, available: 0, percentage: 0, error: err.message };
  }
}

export async function collectNetwork() {
  try {
    const raw = readFileSync("/proc/net/dev", "utf-8");
    const lines = raw.split("\n").slice(2);
    const interfaces = [];

    for (const line of lines) {
      const parts = line.trim().split(/[\s:]+/);
      if (parts.length < 17) continue;
      const name = parts[0];
      if (/^(lo|docker|br-|veth|virbr|zt|tun|wg|tailscale)/.test(name)) continue;

      interfaces.push({
        name,
        rxBytes: parseInt(parts[1]) || 0,
        txBytes: parseInt(parts[9]) || 0,
      });
    }

    return { interfaces };
  } catch (err) {
    return { interfaces: [], error: err.message };
  }
}

export async function collectStorage() {
  try {
    const output = await exec("lsblk -P -no NAME,SIZE,MOUNTPOINT,FSTYPE 2>/dev/null", { timeout: 3000 });
    const lines = output.stdout.trim().split("\n").filter(Boolean);
    const disks = [];
    const PSEUDO = new Set(["tmpfs", "devtmpfs", "proc", "sysfs", "efivarfs", "squashfs", "overlay", "devpts", "cgroup", "cgroup2"]);

    for (const line of lines) {
      const nameMatch = line.match(/NAME="([^"]*)"/);
      const mountMatch = line.match(/MOUNTPOINT="([^"]*)"/);
      const fstypeMatch = line.match(/FSTYPE="([^"]*)"/);
      if (!nameMatch || !mountMatch) continue;

      const name = nameMatch[1];
      const mount = mountMatch[1];
      const fstype = (fstypeMatch?.[1] || "").toLowerCase();
      if (!mount) continue;
      if (/^loop|^sr/.test(name)) continue;
      if (PSEUDO.has(fstype)) continue;

      // Use statfs via a tiny inline approach — just report basic info from lsblk
      disks.push({
        device: name,
        mount: mount || "/",
        totalMB: Math.round(parseInt(line.match(/SIZE="(\d+)"/)?.[1] || "0") / (1024 * 1024)),
        fstype,
      });
    }

    return disks;
  } catch (err) {
    return [];
  }
}

export async function collectLlm() {
  // Probe common LLM endpoints: vLLM, sglang, llama-cpp
  const ports = [8000, 8001, 8888, 8080];
  const results = [];

  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const models = data.data || [];
      for (const model of models) {
        results.push({
          port,
          backend: "vllm",
          modelId: model.id || "unknown",
          available: true,
        });
      }
    } catch {
      // Port not open — skip silently
    }
  }

  return results;
}

export async function collectSystemInfo() {
  try {
    const hostname = (await import("os")).hostname();
    const uptime = readFileSync("/proc/uptime", "utf-8").split(" ")[0];

    return { hostname, uptime: parseFloat(uptime) };
  } catch (err) {
    return { hostname: "unknown", uptime: 0, error: err.message };
  }
}
