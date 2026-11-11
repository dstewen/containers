# sparkDash Exporter — SSH Access Container
# Minimal image for SSH access to DGX Spark nodes
# Used by sparkDash for remote power meter polling

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
FROM ${NODE_IMAGE}

# Runtime system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-client sshpass procps util-linux iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 568 sparkdash && useradd -u 568 -g sparkdash -m -s /bin/sh sparkdash

WORKDIR /app

USER sparkdash

# Prometheus /metrics port is part of sparkDash main app (port 5555)
EXPOSE 5555

CMD ["sleep", "infinity"]
