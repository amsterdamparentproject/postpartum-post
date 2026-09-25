/**
 * Cleans up throwaway rows in the test DB's partners table and restores a
 * small set of reference partner profiles for testing the admin Partners /
 * Leads / Perks views and the partner portal.
 *
 * Mirrors scripts/seed-test-members.mts exactly (see that file for the
 * full rationale) — .env.test and .env.local point at the same Supabase
 * project, so a test run can leave stale rows behind in the same DB the
 * admin UI reads from locally, even when every test cleans up correctly
 * (an interrupted run skips its own afterAll). That's where a stray
 * "Review Test <uuid>" business came from — seeded by
 * __tests__/actions/partner-perks.test.ts's admin-review describe block,
 * whose afterAll(() => cleanupPartner(partner.id)) never got to run.
 *
 * Hard-guarded to .env.test — refuses to run if that file resolves to the
 * production Supabase project.
 *
 * Runs automatically after `yarn test` (scripts/test-quiet.sh) and
 * `yarn test:e2e` (e2e/global-teardown.ts). Run it directly any time you
 * want to restore the reference partners by hand:
 *
 * Usage:
 *   yarn seed-test-partners
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.test") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test");
  process.exit(1);
}

// Safety check: never let this run against production, even if .env.test
// is accidentally misconfigured to point at the live project.
const prodEnv: Record<string, string> = {};
config({ path: resolve(process.cwd(), ".env.production"), processEnv: prodEnv });
if (prodEnv.NEXT_PUBLIC_SUPABASE_URL === supabaseUrl) {
  console.error("Refusing to run: .env.test resolves to the same Supabase project as .env.production.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

// ---------------------------------------------------------------------------
// Reference partners — same whitelist approach as NEW_MEMBERS in
// scripts/seed-test-members.mts: every run leaves the partners table with
// exactly this set (plus their locations), regardless of what's
// accumulated since — old manual test rows, stragglers from an
// interrupted test run, whatever.
//
// Caveat, same as members: .env.test and .env.local share one Supabase
// project, so this also deletes any OTHER partner row in that project,
// including ones from your own manual admin-UI testing. Don't leave
// manual test partners in this DB across a test run if you want them to
// survive it.
//
// Three profiles: "yoga-studio" has a location and portal access (the
// common case); "renske" has neither — a Circle-of-Experts-style
// contributor with no location and, deliberately, no perk — exercising the
// "no portal access yet" state the admin Partners tab renders
// (db/migrations/024_perks.sql documents this as a real, supported partner
// shape, not an edge case); "app-test" is tied to Alex's real inbox
// (amsterdamparentproject@gmail.com) so there's always a partner-portal
// login that magic links actually reach after a test run wipes the table.
// ---------------------------------------------------------------------------

interface ReferenceLocation {
  label: string | null;
  address: string;
  area: string | null;
}

interface ReferencePartner {
  slug: string;
  first_name: string;
  last_name: string;
  business_name: string;
  url: string | null;
  description: string | null;
  email: string | null;
  location: ReferenceLocation | null;
}

const REFERENCE_PARTNERS: ReferencePartner[] = [
  {
    slug: "yoga-studio",
    first_name: "Fenna",
    last_name: "de Boer",
    business_name: "Amsterdam Yoga Studio",
    url: "https://amsterdamyogastudio.example",
    description: "Prenatal and postnatal yoga classes in Oud-West.",
    email: "amsterdamparentproject+partner-yoga@gmail.com",
    location: { label: "Studio", address: "Kinkerstraat 100, Amsterdam", area: "West" },
  },
  {
    slug: "renske",
    first_name: "Renske",
    last_name: "Mulder",
    business_name: "Renske Mulder — Lactation Consultant",
    url: "https://renskemulder.example",
    description: "IBCLC-certified lactation consultant, home visits across Amsterdam.",
    email: null,
    location: null,
  },
  {
    slug: "app-test",
    first_name: "Alex",
    last_name: "Siega",
    business_name: "Amsterdam Parent Project",
    url: "https://amsterdamparentproject.nl",
    description: "Reference partner tied to Alex's inbox for testing the partner portal end to end.",
    email: "amsterdamparentproject@gmail.com",
    location: { label: null, address: "Jan Pieter Heijestraat 1, Amsterdam", area: "West" },
  },
];

/**
 * Deletes every partner row except the reference set. Keyed on
 * business_name rather than email (unlike deleteNonReferenceMembers) —
 * "renske" above has no email, and Postgres's NOT IN never matches a NULL
 * column either way, which would silently exempt every null-email partner
 * from the purge if this used email like the members script does.
 * partner_locations and perks both cascade on partner delete (see
 * db/migrations/024_perks.sql).
 */
async function deleteNonReferencePartners() {
  const referenceNames = REFERENCE_PARTNERS.map((p) => p.business_name);
  console.log(`Removing all partner rows except the ${referenceNames.length} reference profile(s)...`);
  const { data, error } = await supabase
    .from("partners")
    .delete()
    .not("business_name", "in", `(${referenceNames.map((n) => `"${n}"`).join(",")})`)
    .select("id, business_name, email");

  if (error) {
    console.error("Failed to delete non-reference partners:", error.message);
    process.exit(1);
  }
  for (const p of data ?? []) {
    console.log(`  - removed ${p.business_name} (${p.email ?? "no email"})`);
  }
  console.log(`Removed ${data?.length ?? 0} row(s).\n`);
}

async function insertReferencePartners() {
  console.log(`Inserting ${REFERENCE_PARTNERS.length} reference partner(s)...`);

  for (const p of REFERENCE_PARTNERS) {
    // No unique, non-null key to upsert on when email is null (see
    // deleteNonReferencePartners's docblock) — find-by-business_name, then
    // insert or update explicitly, rather than relying on onConflict.
    const { data: existing } = await supabase
      .from("partners")
      .select("id")
      .eq("business_name", p.business_name)
      .maybeSingle();

    const row = {
      first_name: p.first_name,
      last_name: p.last_name,
      business_name: p.business_name,
      url: p.url,
      description: p.description,
      email: p.email,
    };

    const { data: partnerRow, error } = existing
      ? await supabase.from("partners").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("partners").insert(row).select("id").single();

    if (error || !partnerRow) {
      console.error(`  Failed to insert ${p.business_name}:`, error?.message);
      continue;
    }

    // Locations have no natural upsert key across reruns — clear and
    // re-insert rather than trying to match rows up.
    await supabase.from("partner_locations").delete().eq("partner_id", partnerRow.id);
    if (p.location) {
      const { error: locError } = await supabase.from("partner_locations").insert({
        partner_id: partnerRow.id,
        label: p.location.label,
        address: p.location.address,
        area: p.location.area,
      });
      if (locError) console.error(`  Failed to insert location for ${p.business_name}:`, locError.message);
    }

    console.log(`  - ${p.business_name} (${p.email ?? "no portal access"})`);
  }

  console.log(`\nDone inserting reference partners.`);
}

async function main() {
  console.log(`Seeding test partners (${supabaseUrl})\n`);
  await deleteNonReferencePartners();
  await insertReferencePartners();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
