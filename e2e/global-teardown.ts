/**
 * Playwright global teardown — runs once after all tests complete.
 *
 * Sweeps up any e2e test members that were left behind by failed or
 * interrupted runs. Matches the current pattern (amsterdamparentproject+e2e-*
 * @gmail.com — see e2e/helpers/db.ts's testEmail()) plus the older
 * @example.com patterns (both e2e-* and the legacy test-* prefix) so
 * historical stragglers from before the 2026-07-24 domain fix are also
 * cleared.
 */

import path from "path";
import dotenv from "dotenv";
import { purgeTestMembers } from "./helpers/db";

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
}
