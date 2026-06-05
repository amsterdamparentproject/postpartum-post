/**
 * Playwright global teardown — runs once after all tests complete.
 *
 * Sweeps up any e2e test members that were left behind by failed or
 * interrupted runs. Matches both the current pattern (e2e-*) and the
 * old pattern (test-*) so historical stragglers are also cleared.
 */

import path from "path";
import dotenv from "dotenv";
import { purgeTestMembers } from "./helpers/db";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export default async function globalTeardown() {
  const [current, legacy] = await Promise.all([
    purgeTestMembers("e2e-%@example.com"),
    purgeTestMembers("test-%@example.com"),
  ]);
  if (current + legacy > 0) {
    console.log(`[teardown] Purged ${current + legacy} stale e2e member(s) (${current} current, ${legacy} legacy).`);
  }
}
