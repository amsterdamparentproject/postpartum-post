/**
 * Playwright global teardown — runs once after all tests complete.
 *
 * Sweeps up any e2e test members that were left behind by failed or
 * interrupted runs. Matches the current pattern (amsterdamparentproject+e2e-*
 * @gmail.com — see e2e/helpers/db.ts's testEmail()) plus the older
 * @example.com patterns (both e2e-* and the legacy test-* prefix) so
 * historical stragglers from before the 2026-07-24 domain fix are also
 * cleared.
 *
 * Then restores the shared reference members (Sofia, Daan, etc. — see
 * scripts/seed-test-members.mts) to their canonical state. This project's
 * .env.local (which e2e runs against, loaded above) and .env.test point at
 * the same Supabase project — there's no separate test DB — so e2e runs
 * share the same "always come back to a known state" need as `yarn test`
 * (scripts/test-quiet.sh does the equivalent restore there).
 */

import path from "path";
import dotenv from "dotenv";
import { execFileSync } from "child_process";
import { purgeTestMembers } from "./helpers/db";

const REPO_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export default async function globalTeardown() {
  const [current, legacyEmail, legacyTest] = await Promise.all([
    purgeTestMembers("amsterdamparentproject+e2e-%@gmail.com"),
    purgeTestMembers("e2e-%@example.com"),
    purgeTestMembers("test-%@example.com"),
  ]);
  const legacy = legacyEmail + legacyTest;
  if (current + legacy > 0) {
    console.log(`[teardown] Purged ${current + legacy} stale e2e member(s) (${current} current, ${legacy} legacy).`);
  }

  console.log("[teardown] Restoring reference member data...");
  try {
    // Resolve tsx's own binary directly rather than relying on PATH — this
    // teardown can run as a child process spawned by Playwright rather than
    // via a `yarn`/`npm run` script, so node_modules/.bin isn't guaranteed
    // to be on PATH the way it is for scripts/test-quiet.sh's plain `tsx`.
    const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
    execFileSync(tsxBin, ["scripts/seed-test-members.mts"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  } catch (e) {
    console.error("[teardown] Warning: seed-test-members.mts failed — reference member data may be stale.", e);
  }
}
