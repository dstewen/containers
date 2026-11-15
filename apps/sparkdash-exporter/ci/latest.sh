#!/usr/bin/env bash
# Returns a dynamic version based on the current git commit hash
# This ensures every code change triggers a new image build
set -euo pipefail
VERSION="${1:-stable}"

case "${VERSION}" in
  stable)
    # Use short git commit hash so changes to the exporter source always produce a new version
    # latest.sh lives at ci/latest.sh → repo root is 3 levels up: ../../..
    REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
    if [ -d "${REPO_ROOT}/.git" ]; then
      (cd "${REPO_ROOT}" && git rev-parse --short=8 HEAD)
    else
      # Fallback: use date-time as version so builds still happen
      echo "$(date -u +%Y%m%d%H%M%S)"
    fi
    ;;
  *)
    echo "1.0.0"
    ;;
esac
