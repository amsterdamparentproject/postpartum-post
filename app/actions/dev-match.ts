"use server";

/**
 * Dev-only server action behind the match page's test match generator panel.
 * Signs the caller in from their access token, checks the lock-downs in
 * lib/dev-tools.ts, then builds the match (lib/dev-match.ts).
 */

import { createAdminClient } from "@/lib/supabase";
import { devToolsEnabledFor, type DevDistance, type DevScenario } from "@/lib/dev-tools";
import { buildDevMatch, type DevMatchResult } from "@/lib/dev-match";

export async function generateDevMatch(
  accessToken: string,
  scenario: DevScenario,
  distance: DevDistance,
): Promise<DevMatchResult> {
  const supabase = createAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const email = userData?.user?.email;
  if (userError || !email || !devToolsEnabledFor(email)) {
    return { success: false, error: "Dev tools are not available." };
  }
  return buildDevMatch(supabase, email, scenario, distance);
}
