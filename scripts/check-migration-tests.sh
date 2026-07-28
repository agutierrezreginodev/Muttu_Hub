#!/usr/bin/env bash
# scripts/check-migration-tests.sh
#
# CI gate (spec T2 / testing-toolchain scenario "Migration gate: GIVEN
# migration without pgTAP WHEN CI runs THEN fails"). Every file under
# supabase/migrations/*.sql must have at least one matching pgTAP test file
# under supabase/tests/.
#
# Naming convention already in use in this repo: a migration named
# <timestamp>_<slug>.sql (e.g. 20260728041922_identity.sql) is considered
# covered if any file under supabase/tests/ is named "<slug>_*.sql" or
# exactly "<slug>.sql" (e.g. identity_rls.sql covers ..._identity.sql).
# A migration with no matching test file fails the build.
set -euo pipefail

migrations_dir="supabase/migrations"
tests_dir="supabase/tests"

if [ ! -d "$migrations_dir" ]; then
  echo "No $migrations_dir directory found; nothing to check."
  exit 0
fi

missing=0

shopt -s nullglob
for migration in "$migrations_dir"/*.sql; do
  filename=$(basename "$migration")
  # Strip a leading numeric timestamp + underscore (Supabase migration
  # naming), then the .sql suffix, to get the slug.
  slug=$(echo "$filename" | sed -E 's/^[0-9]+_//' | sed -E 's/\.sql$//')

  if [ -z "$slug" ]; then
    echo "::error::Could not derive a slug from migration filename: $filename"
    missing=1
    continue
  fi

  match=0
  if [ -d "$tests_dir" ]; then
    for test_file in "$tests_dir"/*.sql; do
      test_name=$(basename "$test_file")
      if [[ "$test_name" == "${slug}_"* || "$test_name" == "${slug}.sql" ]]; then
        match=1
        break
      fi
    done
  fi

  if [ "$match" -eq 0 ]; then
    echo "::error::Migration '$filename' has no matching pgTAP test file under $tests_dir/ (expected a file named '${slug}_*.sql')."
    missing=1
  else
    echo "OK: $filename is covered by a pgTAP test file."
  fi
done

if [ "$missing" -ne 0 ]; then
  echo ""
  echo "One or more migrations are missing pgTAP coverage. Add a test file before merging (T2)."
  exit 1
fi

echo "All migrations have matching pgTAP test files."
