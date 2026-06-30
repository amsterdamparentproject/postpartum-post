/**
 * Manually confirms a member's account (sets guidelines_accepted_at + eligibility_confirmed_at).
 *
 * Usage:
 *   yarn confirm-member <email>   # confirm one member
 *   yarn confirm-member --all     # confirm all unconfirmed members
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: yarn confirm-member <email> | --all");
  process.exit(1);
}
const confirmAll = arg === "--all";
const email = confirmAll ? null : arg;

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

const now = new Date().toISOString();
const query = supabase
  .from("members")
  .update({ guidelines_accepted_at: now, eligibility_confirmed_at: now })
  .is("guidelines_accepted_at", null)
  .select("id, email, first_name");

if (!confirmAll) query.eq("email", email!);

const { data, error } = await query;

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log("No update made — member(s) not found or already confirmed.");
  process.exit(0);
}

for (const m of data) {
  console.log(`✓ Confirmed ${m.first_name} (${m.email})`);
}
console.log(`\nDone: ${data.length} confirmed`);
