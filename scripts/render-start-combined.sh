#!/usr/bin/env bash
# API + worker on one instance so they share the same uploads/ directory (Render has no shared disk between separate services).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/uploads}"
mkdir -p "$UPLOADS_DIR"
node apps/worker/dist/index.js &
exec node apps/api/dist/main.js
