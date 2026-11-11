"""
Version detection for sparkdash container.
Reads the current version from the tag file (renovate-managed)
or falls back to the latest published container version.
"""
import os

def get_latest(channel):
    """Return the latest version for the given channel."""
    # Check if there's a published container version
    import urllib.request
    import json
    
    try:
        url = "https://api.github.com/users/dstewen/packages/container/sparkdash/versions"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        
        # Find the latest version tag
        for version in data:
            tags = version.get("metadata", {}).get("container", {}).get("tags", [])
            # Look for versioned tags (not "rolling")
            for tag in tags:
                if tag != "rolling" and not tag.startswith("v"):
                    continue
                if tag.startswith("v"):
                    return tag[1:]  # Strip 'v' prefix
            if tags:
                return tags[0]
    except Exception:
        pass
    
    # Fallback: read from tag file
    try:
        tag_path = os.path.join(os.path.dirname(__file__), "..", "tag")
        if os.path.exists(tag_path):
            with open(tag_path) as f:
                for line in f:
                    if "v" in line and "/sparkdash:" in line:
                        return line.split("v")[-1].strip()
    except Exception:
        pass
    
    return None
