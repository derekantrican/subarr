#!/bin/sh
set -e

mkdir -p /app/data /downloads

# Only use su-exec if we're running as root
if [ "$(id -u)" = '0' ]; then
    chown -R subarr:subarr /app/data /downloads 2>/dev/null || true
    exec su-exec subarr "$@"
else
    # Already running as non-root user, just execute the command
    exec "$@"
fi
