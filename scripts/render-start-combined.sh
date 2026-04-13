#!/usr/bin/env bash
# API + worker on one instance so they share the same uploads/ directory (Render has no shared disk between separate services).
# Migrations + seed run here (free tier has no preDeployCommand).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/uploads}"
mkdir -p "$UPLOADS_DIR"
npm --workspace @cars/api run prisma:deploy
npm --workspace @cars/api run prisma:seed
node apps/worker/dist/index.js &
exec node apps/api/dist/main.js
