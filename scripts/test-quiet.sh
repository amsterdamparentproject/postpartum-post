#!/bin/bash
# Runs vitest, saving the full (often very long — app console.log noise
# plus every test's output) run to a gitignored log file, while the
# terminal only shows the compact pass/fail tree and summary.
#
# Usage: yarn test [-- <vitest args>]   — e.g. yarn test -- __tests__/db

LOG_FILE="test-output.log"

# vitest disables its color output as soon as stdout isn't a TTY (which it
# never is once piped into tee/grep below) — force it back on.
FORCE_COLOR=1 vitest run "$@" 2>&1 | tee "$LOG_FILE" | grep --line-buffered -E "✓|❯|×|FAIL|Test Files|Tests |Duration|Start at"
STATUS=${PIPESTATUS[0]}

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
