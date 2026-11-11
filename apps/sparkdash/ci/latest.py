"""
Version detection for sparkdash container.
Reads the latest version from MiaAI-Lab/sparkDash GitHub releases.
The build system (prepare-matrices.py) calls get_latest() to determine
what version tag to use for the container build.
"""
import re

def get_latest(channel):
    """Return the latest sparkDash release version from GitHub."""
    import urllib.request
    
    try:
        url = "https://api.github.com/repos/MiaAI-Lab/sparkDash/releases/latest"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            import json
            data = json.loads(resp.read().decode())
        
        tag = data.get("tag_name", "")
        if tag.startswith("v"):
            return tag[1:]
        return tag
    except Exception as e:
        print(f"Warning: failed to fetch sparkDash release version: {e}")
        return None
