# ============================================================
# sparkDash Exporter — DGX Spark node metrics
# ============================================================
# Runs on each DGX Spark node alongside the DGX Spark software.
# Exposes:
#   - SSH server (port 2222): allows sparkdash to run allowlisted metric commands
#   - HTTP /metrics (port 9100): Prometheus text-format endpoint
#
# Multi-arch: linux/arm64 and linux/amd64
# Uses nvidia/cuda:runtime base for nvidia-smi + driver libs.
# ============================================================

ARG VERSION=dev
ARG REVISION=none

# ─── Stage 1: Build Node.js app ──────────────────────────
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --no-audit --no-fund \
  || (echo "npm install failed once — retrying…" && npm cache clean --force && npm install --no-audit --no-fund)

COPY server/ ./server/

# ─── Stage 2: CUDA runtime base (includes nvidia-smi + driver libs)
# Resolves to correct arch variant (arm64 or amd64) at build time.
ARG CUDA_IMAGE=nvidia/cuda:12.8.1-runtime-ubuntu22.04
FROM ${CUDA_IMAGE}

ARG VERSION=dev
ARG REVISION=none

# Install SSH server + sshpass + basic utilities (add to CUDA base)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server sshpass procps curl \
    && rm -rf /var/lib/apt/lists/*

# Generate a host key if none is provided at runtime
RUN ssh-keygen -A 2>/dev/null || true

WORKDIR /app

# Copy built Node.js app from builder stage
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

LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${REVISION}"

CMD ["node", "server/index.js"]
