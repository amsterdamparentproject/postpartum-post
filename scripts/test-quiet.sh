#!/bin/bash
# Runs vitest, saving the full (often very long — app console.log noise
# plus every test's output) run to a gitignored log file, while the
# terminal only shows the compact pass/fail tree and summary.
#
# Usage: yarn test [-- <vitest args>]   — e.g. yarn test -- __tests__/db

LOG_FILE="test-output.log"
PATTERN="✓|❯|×|FAIL|Test Files|Tests |Duration|Start at"

# vitest disables its color output as soon as stdout isn't a TTY (which it
# never is once piped into tee/grep below) — force it back on.

if [ "$#" -eq 0 ]; then
  # __tests__/api/renew-check.test.ts queries the members table unscoped —
  # mirrors the real cron job, which has no test-run id to filter by — so
  # unlike every other file (scoped by member id, match id, or round month)
  # it can transiently race any other file's test data that matches its
  # candidate filter (status active/canceling, matches_remaining <= 0). Run
  # it alone first; everything else is safe to run at full parallelism.
  RENEW_CHECK="__tests__/api/renew-check.test.ts"

  : > "$LOG_FILE"
  FORCE_COLOR=1 vitest run "$RENEW_CHECK" 2>&1 | tee -a "$LOG_FILE" | grep --line-buffered -E "$PATTERN"
  STATUS=${PIPESTATUS[0]}

  FORCE_COLOR=1 vitest run --exclude "$RENEW_CHECK" 2>&1 | tee -a "$LOG_FILE" | grep --line-buffered -E "$PATTERN"
  STATUS2=${PIPESTATUS[0]}
  if [ "$STATUS2" -ne 0 ]; then
    STATUS="$STATUS2"
  fi
else
  FORCE_COLOR=1 vitest run "$@" 2>&1 | tee "$LOG_FILE" | grep --line-buffered -E "$PATTERN"
  STATUS=${PIPESTATUS[0]}
fi

echo ""
echo "Full output saved to $LOG_FILE"

# .env.test and .env.local point at the same Supabase project (no separate
# test DB available), so a run here can leave the shared reference members
# (Sofia, Daan, etc.) missing or stale even when every test itself cleans up
# correctly — e.g. an interrupted run, or a test with a scoping bug like the
# one fixed in run-matcher.test.ts on 2026-08-28. Reseed them unconditionally
# after every run, pass or fail, so the DB always comes back to a known
# state. Restores members + subscriptions only — see scripts/seed-test-members.mts.
echo "Restoring reference member data..."
tsx scripts/seed-test-members.mts
if [ $? -ne 0 ]; then
  echo "Warning: seed-test-members.mts failed — reference member data may be stale." >&2
fi

exit "$STATUS"
