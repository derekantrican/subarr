#!/bin/sh
set -e

mkdir -p /app/data /downloads
chown -R subarr:subarr /app/data /downloads 2>/dev/null || true

exec su-exec subarr "$@"
