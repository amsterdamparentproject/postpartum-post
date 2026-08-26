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
exit "$STATUS"
