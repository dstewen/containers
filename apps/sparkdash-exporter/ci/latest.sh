#!/usr/bin/env bash
# Returns the latest upstream version for sparkdash-exporter.
# The tag file is updated by Renovate to track the upstream version.
set -euo pipefail
VERSION="${1:-stable}"

case "${VERSION}" in
  stable)
    # Extract version from the tag file (e.g., v1.0.0)
    TAG_FILE="$(dirname "$0")/tag"
    if [ -f "${TAG_FILE}" ]; then
      echo "$(grep -oP 'v\K[0-9.]+' "${TAG_FILE}" | head -n 1)"
    else
      echo "1.0.0"
    fi
    ;;
  *)
    echo "1.0.0"
    ;;
esac
