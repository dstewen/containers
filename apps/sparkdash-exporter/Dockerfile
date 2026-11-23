# ============================================================
# sparkDash Exporter — DGX Spark node metrics
# ============================================================
# Runs on each DGX Spark node alongside the DGX Spark software.
# Exposes:
#   - SSH server (port 2222): allows sparkdash to run allowlisted metric commands
#   - HTTP /metrics (port 9100): Prometheus text-format endpoint
#
# Multi-arch: linux/arm64 and linux/amd64
# ============================================================

ARG VERSION=dev
ARG REVISION=none

# ─── Stage 1: Build Node.js app ──────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --no-audit --no-fund \
  || (echo "npm install failed once — retrying…" && npm cache clean --force && npm install --no-audit --no-fund)

COPY server/ ./server/

# ─── Stage 2: Extract nvidia-smi (amd64 only) ────────────
FROM nvidia/cuda:12.9.2-runtime-ubuntu22.04 AS nvidia-smi-amd64

# ─── Stage 3: Final image ────────────────────────────────
FROM node:22-bookworm-slim

ARG VERSION=dev
ARG REVISION=none

# Install SSH server + sshpass + basic utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server sshpass procps curl \
    && rm -rf /var/lib/apt/lists/*

# Generate SSH host keys
RUN ssh-keygen -A 2>/dev/null || true

WORKDIR /app

# Copy built Node.js app from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server

# Copy nvidia-smi from CUDA image (amd64 only — nvidia-smi binary is amd64)
# nvidia-container-toolkit injects driver libs at runtime; the driver
# package is installed via Talos nvidia-gpu extension on each node.
COPY --from=nvidia-smi-amd64 /usr/bin/nvidia-smi /usr/bin/nvidia-smi

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

LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${REVISION}"

CMD ["node", "server/index.js"]
