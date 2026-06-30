/**
 * Resets consent fields for a member (for testing).
 *
 * Usage:
 *   yarn reset-consent <email>
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: yarn reset-consent <email>");
  process.exit(1);
}

config({ path: resolve(process.cwd(), ".env.production") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.production");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

const { data, error } = await supabase
  .from("members")
  .update({ guidelines_accepted_at: null, eligibility_confirmed_at: null })
  .eq("email", email)
  .select("first_name, email")
  .single();

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

console.log(`✓ Reset ${data.first_name} (${data.email})`);
