# ============================================================
# sparkDash — Multi-DGX Spark Monitoring Dashboard
# Custom Dockerfile for talos-mixed (dstewen/containers)
# ============================================================
#
# Forked from MiaAI-Lab/sparkDash/Dockerfile with the following
# adjustments:
#   - Uses public.ecr.aws mirror (avoids IPv6 DNS issues on Sparks)
#   - Explicitly tags as multi-arch (arm64)
#   - No changes to build logic (frontend bundles are arch-indep)
#   - Matches dstewen/containers patterns (node:22-bookworm-slim)

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

# --- Stage 1: Builder (runs on build machine's arch) ---
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS builder

WORKDIR /app

# Install build deps (needed for native node_modules)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install (retry because npm can flake)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund \
  || (echo "npm ci failed — retrying…" && npm cache clean --force && npm ci --no-audit --no-fund)

# History retention window (default 8h, override via build-arg)
ARG VITE_HISTORY_HOURS=8
ENV VITE_HISTORY_HOURS=${VITE_HISTORY_HOURS}

# Copy source and build frontend
COPY . .
RUN npm run build

# Prune devDependencies to keep runtime image lean
RUN npm prune --omit=dev --no-audit --no-fund \
  || (npm install --omit=dev --no-audit --no-fund && npm prune --omit=dev --no-audit --no-fund)

# --- Stage 2: Runtime (arm64, minimal) ---
FROM ${NODE_IMAGE}

# SSH client + sshpass for remote Sparks; util-linux for nsenter
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client sshpass procps util-linux iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy baked assets (compose bind-mounts ./dist over the top)
COPY --from=builder /app/dist ./dist-baked
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/shared ./src/shared
COPY --from=builder /app/src/components/ShowcasePage/showcasePrompts.ts \
    ./src/components/ShowcasePage/showcasePrompts.ts
COPY --from=builder /app/config ./config

# Persistent config for sparks.json (hot-editable from UI)
VOLUME /app/config

EXPOSE 5555

ENV PORT=5555
ENV LLM_PORT=8888
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
