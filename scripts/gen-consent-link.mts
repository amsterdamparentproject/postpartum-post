/**
 * Generates a consent confirmation link for a member by email.
 *
 * Usage:
 *   yarn consent-link <email>
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { generateConsentToken } from "../lib/tokens.ts";

const email = process.argv[2];
if (!email) {
  console.error("Usage: yarn consent-link <email>");
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

const { data: member, error } = await supabase
  .from("members")
  .select("id")
  .eq("email", email)
  .single();

if (error || !member) {
  console.error("Member not found:", email);
  process.exit(1);
}

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const token = generateConsentToken(member.id);
const url = `${SITE_URL}/api/consent/confirm?member_id=${member.id}&token=${token}`;

console.log(url);
console.error(`[debug] member_id: ${member.id}`);
console.error(`[debug] token prefix: ${token.slice(0, 8)}...`);
