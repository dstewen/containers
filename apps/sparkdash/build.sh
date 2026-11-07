#!/usr/bin/env bash
# ============================================================
# Build & push sparkDash for talos-mixed
# Usage: ./build.sh <version>
# Example: ./build.sh 2.77.0
# ============================================================
set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
IMAGE_NAME="sparkdash"
REPO="MiaAI-Lab/sparkDash"
TAG="v${VERSION}"

echo "📦  Building sparkDash ${VERSION} ..."
echo "📤  Target: ghcr.io/dstewen/containers/${IMAGE_NAME}:${TAG}"

# Download the sparkDash release tarball
TARBALL="$(mktemp)"
echo "⬇️   Fetching ${REPO} v${VERSION} ..."
curl -sL "https://github.com/${REPO}/archive/refs/tags/v${VERSION}.tar.gz" \
  -o "${TARBALL}"

# Build from the extracted tarball
# --no-cache: ensures fresh node_modules install
docker build \
  --no-cache \
  --build-arg VITE_HISTORY_HOURS=8 \
  -t "ghcr.io/dstewen/containers/${IMAGE_NAME}:${TAG}" \
  -t "ghcr.io/dstewen/containers/${IMAGE_NAME}:latest" \
  -f Dockerfile \
  < <(tar -xzf "${TARBALL}" --strip-components=1 && cat)

# Clean up
rm -f "${TARBALL}"

# Push both tagged versions
echo "🚀  Pushing images ..."
docker push "ghcr.io/dstewen/containers/${IMAGE_NAME}:${TAG}"
docker push "ghcr.io/dstewen/containers/${IMAGE_NAME}:latest"

echo "✅  Done:"
echo "   ghcr.io/dstewen/containers/${IMAGE_NAME}:${TAG}"
echo "   ghcr.io/dstewen/containers/${IMAGE_NAME}:latest"
