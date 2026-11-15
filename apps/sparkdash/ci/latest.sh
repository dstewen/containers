#!/usr/bin/env bash
# Returns the latest upstream sparkDash release version
set -euo pipefail
VERSION="${1:-stable}"

case "${VERSION}" in
  stable)
    # Query GitHub API for the latest non-prerelease release
    curl -sL "https://api.github.com/repos/MiaAI-Lab/sparkDash/releases/latest" \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('tag_name',''))" \
      | sed 's/^v//'
    ;;
  *)
    echo "1.0.0"
    ;;
esac
