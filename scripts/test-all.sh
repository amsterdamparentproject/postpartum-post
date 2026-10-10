#!/bin/bash
# Full test run: switch to the Node version in .nvmrc (the one Netlify builds
# with), then unit/integration tests, then Playwright e2e. Stops at the first
# failing suite, and restores the shared reference data exactly once at the
# end — pass, fail, or Ctrl-C.
#
# Usage: yarn test:all
#
# Heads-up: both suites talk to the shared Supabase project and Stripe test
# mode (.env.test and .env.local point at the same project). Don't run this
# while something else is using that project.

cd "$(dirname "$0")/.." || exit 1

WANT="$(tr -d 'v \n' < .nvmrc)"   # e.g. 24
have_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

# nvm refuses to run when PREFIX is set (Homebrew setups often export it as
# /opt/homebrew). Unsetting it here only affects this script, not your shell.
unset PREFIX

# nvm is a shell function, not a program, so a script has to load it itself.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
for f in "$NVM_DIR/nvm.sh" /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh; do
  if [ -s "$f" ]; then
    . "$f"
    break
  fi
done

if command -v nvm >/dev/null 2>&1; then
  nvm use || { nvm install && nvm use; } || exit 1
elif command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  fnm use --install-if-missing "$WANT" || exit 1
elif command -v volta >/dev/null 2>&1; then
  : # Volta switches automatically, but only from a "volta" key in package.json.
fi

# Whatever tool (or none) got us here, refuse to test on the wrong Node.
if [ "$(have_major)" != "$WANT" ]; then
  echo "Need Node $WANT (from .nvmrc) but found $(node -v 2>/dev/null || echo none)." >&2
  echo "Switch with your version manager (nvm, fnm, volta, asdf, n, ...) and rerun." >&2
  exit 1
fi
echo "Using Node $(node -v) (from .nvmrc)"

# Each suite normally reseeds the reference data when it finishes. Skip that
# for both and do it once below instead.
export SKIP_RESEED=1

reseed() {
  local status=$?
  trap - EXIT
  unset SKIP_RESEED
  echo ""
  echo "Restoring reference member data..."
  ./node_modules/.bin/tsx scripts/seed-test-members.mts \
    || echo "Warning: seed-test-members.mts failed — reference member data may be stale." >&2
  echo "Restoring reference partner data..."
  ./node_modules/.bin/tsx scripts/seed-test-partners.mts \
    || echo "Warning: seed-test-partners.mts failed — reference partner data may be stale." >&2
  exit "$status"
}
trap reseed EXIT

yarn test || exit $?

# Optional pause between suites if Supabase's auth rate limit keeps tripping
# e2e right after the unit tests, e.g. TEST_ALL_COOLDOWN=120 yarn test:all.
# Off by default so a normal run isn't any slower.
if [ "${TEST_ALL_COOLDOWN:-0}" -gt 0 ]; then
  echo "Cooling down ${TEST_ALL_COOLDOWN}s before e2e (auth rate limit)..."
  sleep "$TEST_ALL_COOLDOWN"
fi

yarn test:e2e
