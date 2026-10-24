# Archived scripts

One-off scripts that already ran (backfills, migrations, cleanups, rehearsals,
one-time announcements) or checks for behavior that no longer exists. Kept for
reference and history; not maintained.

- Do not run them as-is. Relative imports (`../lib/...`) point at the old
  location and the code they call may have changed since.
- If one is needed again, copy it back to `scripts/`, fix its imports, re-read
  it against current code, and dry-run first.

Archived 2026-10-24.
