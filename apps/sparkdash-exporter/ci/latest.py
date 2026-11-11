"""
Version detection for sparkdash-exporter container.
Uses a fixed version for now since it's a custom image.
"""
import os

def get_latest(channel):
    """Return the latest version for the given channel."""
    # For sparkdash-exporter, use the Dockerfile git commit or a fixed version
    # Since it's a custom minimal image, we track version by git tag or use "1.0.0"
    import urllib.request
    import json
    
    try:
        url = "https://api.github.com/users/dstewen/packages/container/sparkdash-exporter/versions"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        
        for version in data:
            tags = version.get("metadata", {}).get("container", {}).get("tags", [])
            for tag in tags:
                if tag != "rolling" and not tag.startswith("v"):
                    continue
                if tag.startswith("v"):
                    return tag[1:]
            if tags:
                return tags[0]
    except Exception:
        pass
    
    return "1.0.0"  # Default version for custom image
