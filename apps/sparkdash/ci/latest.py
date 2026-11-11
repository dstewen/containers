"""
Version detection for sparkdash container.
Returns the latest sparkDash release version.
"""

def get_latest(channel):
    """Return the latest sparkDash release version."""
    # Hardcoded since GitHub API is rate-limited on build workers
    return "2.32.0"
