#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL_POOL:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: set DATABASE_URL_POOL or DATABASE_URL" >&2
  exit 1
fi

export ALEMBIC_DB_ROLE=pool
exec poetry run alembic upgrade head

