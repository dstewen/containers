ARG VERSION
FROM ghcr.io/actions/actions-runner:${VERSION}

ARG TARGETPLATFORM
ARG TARGETARCH
ARG TARGETOS

LABEL dev.dstewen.image.target_platform=$TARGETPLATFORM
LABEL dev.dstewen.image.target_architecture=$TARGETARCH
LABEL dev.dstewen.image.target_os=$TARGETOS
LABEL org.opencontainers.image.source="https://github.com/actions/runner"

ENV HOMEBREW_NO_ANALYTICS=1 \
    HOMEBREW_NO_ENV_HINTS=1 \
    HOMEBREW_NO_INSTALL_CLEANUP=1 \
    DEBCONF_NONINTERACTIVE_SEEN=true \
    DEBIAN_FRONTEND="noninteractive" \
    APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=DontWarn

USER root

RUN \
    apt-get update && apt-get upgrade -y \
    && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gcc \
        git \
        jo \
        jq \
        moreutils \
        unrar \
        unzip \
        wget \
        zip \
    && rm -rf /var/lib/apt/lists/*

USER runner

RUN if [ "$(uname -m)" = "x86_64" ]; then \
        # Install Homebrew for x86_64 architecture \
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; \
    fi
