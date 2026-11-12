/**
 * Prometheus text exposition (format 0.0.4) for sparkDash exporter.
 *
 * Mirrors the naming and structure from sparkdash/server/prometheus.js so
 * dashboards and alerting rules work the same whether scraped from sparkdash
 * itself or from the exporter running on each node.
 *
 * Unknown is not zero. Zero-filled defaults from collectors are not exported;
 * a node that is unreachable still exports sparkdash_up 0 and nothing else.
 */

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const MIB = 1024 * 1024;
const MIB_NOTE = "sparkDash collects MiB; converted to bytes.";

export const METRIC_FAMILIES = [
  { name: "sparkdash_up", type: "gauge", help: "1 when the unit answered its last liveness check, 0 when unreachable." },
  { name: "sparkdash_uptime_seconds", type: "gauge", help: "Host uptime from /proc/uptime." },
  { name: "sparkdash_collector_last_success_timestamp_seconds", type: "gauge", help: "Unix time of last successful poll of this collector." },
  { name: "sparkdash_gpu_info", type: "gauge", help: "Always 1; carries GPU name and UUID." },
  { name: "sparkdash_gpu_utilization_ratio", type: "gauge", help: "GPU utilization (0-1)." },
  { name: "sparkdash_gpu_temperature_celsius", type: "gauge", help: "GPU die temperature in Celsius." },
  { name: "sparkdash_gpu_power_watts", type: "gauge", help: "GPU board power draw in watts." },
  { name: "sparkdash_gpu_power_limit_watts", type: "gauge", help: "GPU power limit in watts." },
  { name: "sparkdash_gpu_memory_used_bytes", type: "gauge", help: `GPU memory in use. ${MIB_NOTE}` },
  { name: "sparkdash_gpu_memory_total_bytes", type: "gauge", help: `GPU memory size. ${MIB_NOTE}` },
  { name: "sparkdash_gpu_throttled", type: "gauge", help: "1 when nvidia-smi reports throttling for this reason." },
  { name: "sparkdash_memory_available_bytes", type: "gauge", help: `Memory headroom for new GPU work. ${MIB_NOTE}` },
  { name: "sparkdash_cpu_utilization_ratio", type: "gauge", help: "CPU utilization (0-1)." },
  { name: "sparkdash_cpu_temperature_celsius", type: "gauge", help: "CPU temperature in Celsius." },
  { name: "sparkdash_ram_used_bytes", type: "gauge", help: `System RAM in use. ${MIB_NOTE}` },
  { name: "sparkdash_ram_total_bytes", type: "gauge", help: `System RAM size. ${MIB_NOTE}` },
  { name: "sparkdash_network_receive_bytes_per_second", type: "gauge", help: "Receive rate per interface." },
  { name: "sparkdash_network_transmit_bytes_per_second", type: "gauge", help: "Transmit rate per interface." },
  { name: "sparkdash_disk_used_bytes", type: "gauge", help: `Filesystem space in use. ${MIB_NOTE}` },
  { name: "sparkdash_disk_available_bytes", type: "gauge", help: `Filesystem space available. ${MIB_NOTE}` },
  { name: "sparkdash_disk_total_bytes", type: "gauge", help: `Filesystem size. ${MIB_NOTE}` },
  { name: "sparkdash_llm_up", type: "gauge", help: "1 when LLM endpoint answered, else 0." },
  { name: "sparkdash_llm_generation_tokens_per_second", type: "gauge", help: "Decode throughput." },
  { name: "sparkdash_llm_prefill_tokens_per_second", type: "gauge", help: "Prefill throughput." },
  { name: "sparkdash_llm_kv_cache_usage_ratio", type: "gauge", help: "KV cache usage ratio (0-1)." },
  { name: "sparkdash_llm_requests_running", type: "gauge", help: "Requests currently running." },
  { name: "sparkdash_llm_requests_waiting", type: "gauge", help: "Requests queued." },
  { name: "sparkdash_llm_generated_tokens_total", type: "counter", help: "Output tokens generated." },
  { name: "sparkdash_llm_prompt_tokens_total", type: "counter", help: "Prompt tokens processed." },
  { name: "sparkdash_llm_cached_prompt_tokens_total", type: "counter", help: "Prompt tokens from cache." },
  { name: "sparkdash_power_meter_up", type: "gauge", help: "1 when the power meter is reachable, 0 when not." },
  { name: "sparkdash_wall_power_watts", type: "gauge", help: "Wall power in watts from the power meter." },
];

const FAMILY_BY_NAME = new Map(METRIC_FAMILIES.map(f => [f.name, f]));

export function escapeLabelValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function escapeHelp(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

export function formatValue(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "+Inf";
  if (value === -Infinity) return "-Inf";
  return String(value);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function ratio(percent) {
  return Math.round((percent / 100) * 1e6) / 1e6;
}

function bytesFromMib(mib) {
  return Math.round(mib * MIB);
}

function formatLabels(labels) {
  const parts = [];
  for (const [key, value] of Object.entries(labels)) {
    if (value == null || value === "") continue;
    parts.push(`${key}="${escapeLabelValue(value)}"`);
  }
  return parts.length ? `{${parts.join(",")}}` : "";
}

class SampleSet {
  constructor() {
    this.families = new Map();
  }

  add(name, labels, value) {
    if (!FAMILY_BY_NAME.has(name)) throw new Error(`unknown metric family ${name}`);
    if (!finite(value)) return;
    let series = this.families.get(name);
    if (!series) { series = new Map(); this.families.set(name, series); }
    const labelString = formatLabels(labels);
    if (!series.has(labelString)) series.set(labelString, formatValue(value));
  }

  render() {
    const lines = [];
    for (const family of METRIC_FAMILIES) {
      const series = this.families.get(family.name);
      if (!series && family.name !== "sparkdash_up") continue;
      lines.push(`# HELP ${family.name} ${escapeHelp(family.help)}`);
      lines.push(`# TYPE ${family.name} ${family.type}`);
      for (const [labelString, value] of series || []) {
        lines.push(`${family.name}${labelString} ${value}`);
      }
    }
    return lines.join("\n") + "\n";
  }
}

function isDefaultGpu(gpu) {
  return !gpu || (gpu.temperature === 0 && gpu.usage === 0 && gpu.power?.draw === 0 && (!gpu.vram || gpu.vram.total === 0));
}

function isDefaultCpu(cpu) {
  return !cpu || (cpu.usage === 0 && cpu.temperature === 0 && cpu.draw === 0 && cpu.tdp === 0);
}

function addGpu(samples, base, gpu) {
  if (!gpu || isDefaultGpu(gpu)) return;
  const devices = Array.isArray(gpu.gpus) && gpu.gpus.length > 0 ? gpu.gpus : [{ ...gpu, index: 0, name: null, uuid: null }];
  for (const device of devices) {
    const index = finite(device?.index) ? device.index : 0;
    const labels = { ...base, gpu: String(index) };
    if (device.name || device.uuid) {
      samples.add("sparkdash_gpu_info", { ...labels, name: device.name ?? null, uuid: device.uuid ?? null }, 1);
    }
    if (finite(device.usage)) samples.add("sparkdash_gpu_utilization_ratio", labels, ratio(device.usage));
    samples.add("sparkdash_gpu_temperature_celsius", labels, device.temperature);
    samples.add("sparkdash_gpu_power_watts", labels, device.power?.draw);
    if (finite(device.power?.limit) && device.power.limit > 0) {
      samples.add("sparkdash_gpu_power_limit_watts", labels, device.power.limit);
    }
    const vram = device.vram;
    if (vram && finite(vram.total) && vram.total > 0) {
      if (finite(vram.used)) samples.add("sparkdash_gpu_memory_used_bytes", labels, bytesFromMib(vram.used));
      samples.add("sparkdash_gpu_memory_total_bytes", labels, bytesFromMib(vram.total));
    }
    const throttle = device.throttle;
    if (throttle && typeof throttle === "object" && throttle.active) {
      if (throttle.thermal) samples.add("sparkdash_gpu_throttled", { ...labels, reason: "thermal" }, 1);
      if (throttle.powerCap) samples.add("sparkdash_gpu_throttled", { ...labels, reason: "power" }, 1);
      if (throttle.hwSlowdown) samples.add("sparkdash_gpu_throttled", { ...labels, reason: "hw" }, 1);
    }
  }
}

function addLlm(samples, base, llmEntries) {
  if (!Array.isArray(llmEntries)) return;
  for (const entry of llmEntries) {
    if (!entry || typeof entry !== "object") continue;
    const labels = { ...base, port: String(entry.port ?? 0), backend: entry.backend ?? null, model: entry.modelId ?? null };
    samples.add("sparkdash_llm_up", labels, entry.available === true ? 1 : 0);
    if (entry.available !== true) continue;
    if (finite(entry.generationTps)) samples.add("sparkdash_llm_generation_tokens_per_second", labels, entry.generationTps);
    if (finite(entry.prefillTps)) samples.add("sparkdash_llm_prefill_tokens_per_second", labels, entry.prefillTps);
    if (finite(entry.kvCacheUsage)) samples.add("sparkdash_llm_kv_cache_usage_ratio", labels, entry.kvCacheUsage);
    if (finite(entry.requestsRunning)) samples.add("sparkdash_llm_requests_running", labels, entry.requestsRunning);
    if (finite(entry.requestsWaiting)) samples.add("sparkdash_llm_requests_waiting", labels, entry.requestsWaiting);
    if (finite(entry.totalOutputTokens) && entry.totalOutputTokens > 0) {
      samples.add("sparkdash_llm_generated_tokens_total", labels, entry.totalOutputTokens);
    }
    if (finite(entry.totalPromptTokens)) samples.add("sparkdash_llm_prompt_tokens_total", labels, entry.totalPromptTokens);
    if (finite(entry.totalCachedTokens)) samples.add("sparkdash_llm_cached_prompt_tokens_total", labels, entry.totalCachedTokens);
  }
}

function addPowerMeters(samples, base, powerMeters) {
  if (!Array.isArray(powerMeters)) return;
  for (const meter of powerMeters) {
    if (!meter || typeof meter !== "object") continue;
    const labels = { ...base, meter: meter.name ?? null, channel: meter.channel ?? null };
    samples.add("sparkdash_power_meter_up", labels, meter.up === true ? 1 : 0);
    if (meter.up === true && finite(meter.watts)) {
      samples.add("sparkdash_wall_power_watts", labels, meter.watts);
    }
  }
}

/**
 * Build metrics entries from a collector snapshot.
 * Returns an object compatible with renderMetrics.
 */
function buildEntry(nodeName, gpu, cpu, ram, network, storage, llm, powerMeters) {
  return {
    id: "local",
    name: nodeName,
    kind: "spark",
    role: "standalone",
    online: true,
    uptime: 0,
    collectedAt: {},
    metrics: {
      gpu, cpu,
      ram,
      storage: storage || [],
      network,
      llm: llm || [],
    },
    powerMeters,
  };
}

export function renderMetrics(entries) {
  const samples = new SampleSet();

  for (const entry of (entries || [])) {
    const snapshot = entry.snapshot || entry;
    if (!snapshot || typeof snapshot !== "object") continue;
    const base = {
      unit: snapshot.id || "local",
      unit_name: snapshot.name || "local-node",
      kind: snapshot.kind || "spark",
      role: snapshot.role || "standalone",
    };

    const online = snapshot.online !== false;
    samples.add("sparkdash_up", base, online ? 1 : 0);
    if (online && finite(snapshot.uptime)) {
      samples.add("sparkdash_uptime_seconds", base, snapshot.uptime);
    }

    if (!online) continue;

    const metrics = snapshot.metrics || {};

    // GPU
    if (metrics.gpu) addGpu(samples, base, metrics.gpu);

    // CPU
    const cpu = metrics.cpu;
    if (cpu && !isDefaultCpu(cpu)) {
      if (finite(cpu.usage)) samples.add("sparkdash_cpu_utilization_ratio", base, ratio(cpu.usage));
      if (finite(cpu.temperature) && cpu.temperature > 0) {
        samples.add("sparkdash_cpu_temperature_celsius", { ...base, sensor: cpu.temperatureSource ?? null }, cpu.temperature);
      }
    }

    // RAM
    const ram = metrics.ram;
    if (ram && finite(ram.total) && ram.total > 0) {
      samples.add("sparkdash_ram_used_bytes", base, bytesFromMib(ram.used));
      samples.add("sparkdash_ram_total_bytes", base, bytesFromMib(ram.total));
    }

    // Network — collect rates (just raw counters for now; rates computed by caller)
    const ifaces = Array.isArray(metrics.network?.interfaces) ? metrics.network.interfaces : [];
    for (const iface of ifaces) {
      if (!iface?.name || iface.disabled) continue;
      const labels = { ...base, interface: iface.name };
      if (finite(iface.rxBytes)) samples.add("sparkdash_network_receive_bytes_per_second", labels, iface.rxBytes);
      if (finite(iface.txBytes)) samples.add("sparkdash_network_transmit_bytes_per_second", labels, iface.txBytes);
    }

    // Storage
    const storages = Array.isArray(metrics.storage) ? metrics.storage : [];
    for (const disk of storages) {
      if (!disk || !finite(disk.totalMB) || disk.totalMB <= 0) continue;
      const labels = { ...base, mount: disk.mount || null, device: disk.device || null };
      samples.add("sparkdash_disk_total_bytes", labels, bytesFromMib(disk.totalMB));
    }

    // LLM
    const llmEntries = Array.isArray(metrics.llm) ? metrics.llm : [];
    if (llmEntries.length > 0) addLlm(samples, base, llmEntries);

    // Power meters (from exporter config)
    if (entry.powerMeters && Array.isArray(entry.powerMeters)) {
      addPowerMeters(samples, base, entry.powerMeters);
    }
  }

  return samples.render();
}
