#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
data_dir="$project_root/deploy/data"
backup_dir="$data_dir/backups"
umask 077
mkdir -p "$backup_dir"
python3 "$project_root/scripts/session-db.py" backup \
  "$data_dir/plan.sqlite3" \
  "$backup_dir/plan-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
