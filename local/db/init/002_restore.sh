#!/bin/bash
set -e

echo "Restoring nyc_data.backup..."
pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner /docker-entrypoint-initdb.d/nyc_data.backup
echo "Restore complete."
