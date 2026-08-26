#!/bin/bash
# Starts the dev server on :3001 and forwards Stripe webhooks to it,
# together. Ctrl-C stops both.
#
# Usage: yarn start-post
#
# Assumes the Stripe CLI is installed and logged in (`stripe login`) —
# see __claude__/local-testing-guide.md. Update STRIPE_WEBHOOK_SECRET in
# .env.local with the whsec_... this prints if it differs from what's
# there now.

PORT=3001

cleanup() {
  echo ""
  echo "Stopping dev server and stripe listen..."
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null
  [ -n "$STRIPE_PID" ] && kill "$STRIPE_PID" 2>/dev/null
  wait "$DEV_PID" "$STRIPE_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

next dev -p "$PORT" &
DEV_PID=$!

stripe listen --forward-to "localhost:$PORT/api/webhooks/stripe" &
STRIPE_PID=$!

wait -n "$DEV_PID" "$STRIPE_PID"
cleanup
