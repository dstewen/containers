# sparkDash Exporter

Runs on each DGX Spark node. Provides two services:

1. **SSH server** (port 2222) — allows sparkDash to execute allowlisted metric commands on the node without needing full shell access.
2. **HTTP /metrics** (port 9100) — Prometheus text-format endpoint for direct scraping.

## Architecture

```
sparkDash (dashboard) ──SSH──▶ sparkdash-exporter (DGX Spark node)
                                │
                                ├── ssh: gpu-metrics, cpu-metrics, ...
                                └── http: /metrics (Prometheus format)
```

The exporter runs locally on the node, so there are no SSH/GPU dependencies on the sparkDash host.

## Commands (SSH)

The SSH server only allows these commands:

| Command | Description |
|---------|-------------|
| `probe` | Health check, returns `{ status: "ok" }` |
| `gpu-metrics` | GPU temperature, usage, power, VRAM, processes |
| `cpu-metrics` | CPU usage, temperature, power draw |
| `memory-metrics` | System RAM usage |
| `network-metrics` | Network interface counters |
| `storage-metrics` | Disk/partition info |
| `llm-metrics` | Probes vLLM/sglang endpoints on the node |
| `system-info` | Hostname, uptime |

## Prometheus Metrics

`GET /metrics` returns metrics in Prometheus text exposition format 0.0.4:

- `sparkdash_up{unit,unit_name}` — 1 if node is reachable
- `sparkdash_gpu_*` — GPU metrics per card
- `sparkdash_cpu_*` — CPU utilization and temperature
- `sparkdash_ram_*` — System RAM
- `sparkdash_network_*` — Network interface stats
- `sparkdash_disk_*` — Storage usage
- `sparkdash_llm_*` — LLM engine metrics
- `sparkdash_wall_power_watts{unit,meter}` — Wall power from Home Assistant

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ESPORT` | `2222` | SSH server port |
| `METRICS_PORT` | `9100` | HTTP /metrics port |
| `ES_SSH_HOST_KEY` | `/etc/ssh/ssh_host_ed25519_key` | SSH host key path |
| `ES_ACCEPT_PASSWORD` | `0` | Accept password auth (default: key-only) |
| `ES_POWER_METERS_CONFIG` | `/app/config/power-meters.json` | Path to power meters config |
| `SPARKDASH_HA_TOKEN` | — | Home Assistant long-lived access token |

### Power Meters (Home Assistant)

To enable wall power monitoring, mount a `power-meters.json` config via configmap or bind mount:

```json
{
  "meters": {
    "ha": {
      "type": "homeassistant",
      "url": "https://homeassistant.local:8123"
    }
  },
  "units": {
    "spark-a": {
      "meter": "ha",
      "channel": "sensor.power_strip_outlet_3_power",
      "since": "2026-08-13T00:00:00Z"
    }
  },
  "pollIntervalMs": 10000,
  "staleAfterMs": 30000
}
```

The HA token must be set via `SPARKDASH_HA_TOKEN` environment variable. Tokens are **never** read from the config file for security.

## Docker Compose (development)

```yaml
services:
  sparkdash-exporter:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "2222:2222"
      - "9100:9100"
    environment:
      - NODE_ENV=production
      - ESPORT=2222
      - METRICS_PORT=9100
      - SPARKDASH_HA_TOKEN=${SPARKDASH_HA_TOKEN:-}
    volumes:
      - ./config/power-meters.json:/app/config/power-meters.json:ro
    restart: unless-stopped
```

## Building

```bash
docker buildx build --load -t sparkdash-exporter:latest -f Dockerfile .
```
