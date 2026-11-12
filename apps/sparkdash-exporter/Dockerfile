# ============================================================
# sparkDash Exporter — DGX Spark node metrics
# ============================================================
# Runs on each DGX Spark node alongside the DGX Spark software.
# Exposes:
#   - SSH server (port 2222): allows sparkdash to run allowlisted metric commands
#   - HTTP /metrics (port 9100): Prometheus text-format endpoint

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --no-audit --no-fund \
  || (echo "npm install failed once — retrying…" && npm cache clean --force && npm install --no-audit --no-fund)

COPY server/ ./server/

# ============================================================
# Production image — SSH + HTTP exporter, no GPU deps baked in
# (GPU tools run natively on the host; the exporter calls them)
# ============================================================
FROM ${NODE_IMAGE}

# SSH server, nvidia-smi path, and basic utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server sshpass procps \
    && rm -rf /var/lib/apt/lists/*

# Generate a host key if none is provided at runtime
RUN ssh-keygen -A 2>/dev/null || true

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server

# Create config volume for power meters
VOLUME /app/config

# Environment
ENV PORT=9100
ENV ESPORT=2222
ENV METRICS_PORT=9100
ENV NODE_ENV=production
# Path to power-meters.json config (mounted via configmap or bind mount)
ENV ES_POWER_METERS_CONFIG=/app/config/power-meters.json
# Optional SSH host key (defaults to generated key)
ENV ES_SSH_HOST_KEY=/etc/ssh/ssh_host_ed25519_key

EXPOSE 2222 9100

CMD ["node", "server/index.js"]
