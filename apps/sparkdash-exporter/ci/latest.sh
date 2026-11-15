#!/usr/bin/env bash
# Returns a dynamic version based on the current git commit hash
# This ensures every code change triggers a new image build
set -euo pipefail
VERSION="${1:-stable}"

case "${VERSION}" in
  stable)
    # Use short git commit hash so changes to the exporter source always produce a new version
    # Try relative path first (CI checkout), fall back to git directory detection
    if [ -d "$(cd "$(dirname "$0")/../.." && pwd)/.git" ]; then
      (cd "$(cd "$(dirname "$0")/../../.." && pwd)" && git rev-parse --short=8 HEAD)
    else
      # Fallback: use date-time as version so builds still happen
      echo "$(date -u +%Y%m%d%H%M%S)"
    fi
    ;;
  *)
    echo "1.0.0"
    ;;
esac
