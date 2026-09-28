/**
 * Cleans up throwaway rows in the test DB's partners table and restores a
 * small set of reference partner profiles -- and reference perks on them
 * covering all three redemption types (code / in_person / online) plus a
 * 'once'-frequency intro offer, with all three types on app-test alone so
 * Alex's own partner-portal login always has one of each -- for testing
 * the admin Partners / Leads / Perks views and the partner portal.
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
import { geocodeAddress } from "../lib/geocode";

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
// Four profiles: "yoga-studio" has a location and portal access (the
// common case); "renske" has neither — a Circle-of-Experts-style
// contributor with no location and, deliberately, no perk — exercising the
// "no portal access yet" state the admin Partners tab renders
// (db/migrations/024_perks.sql documents this as a real, supported partner
// shape, not an edge case); "app-test" is tied to Alex's real inbox
// (amsterdamparentproject@gmail.com) so there's always a partner-portal
// login that magic links actually reach after a test run wipes the table;
// "rijksmuseum" has a location with real coordinates, so its perks show
// on the match map.
//
// Each of the other three also carries reference perks, together covering
// all three redemption types and both frequencies: yoga-studio is 'code' +
// exclusive + a 'once' intro offer; app-test carries all three types
// (code / in_person / online) since it's Alex's own partner-portal login
// and should always have one of each to test against; rijksmuseum is
// 'in_person' + monthly. Reinserted the same way as the partners
// themselves (find-by-title-and-partner, then update or insert), so
// manually edited fields on them (e.g. flipping status to 'pending' while
// testing the review queue) get reset on the next run — same tradeoff the
// partner/location sync already makes.
// ---------------------------------------------------------------------------

interface ReferenceLocation {
  label: string | null;
  address: string;
  area: string | null;
  // Optional: set these to put the location on the match map without
  // relying on a live geocoding call.
  neighborhood?: string | null;
  latitude?: number;
  longitude?: number;
}

interface ReferencePerk {
  title: string;
  description: string;
  redemption_type: "code" | "in_person" | "online";
  redemption_code?: string; // required when redemption_type is 'code'
  url?: string;             // required when redemption_type is 'online'
  exclusive?: boolean;      // default false
  // 'once' = an intro offer, redeemable a single time per member ever
  // (db/migrations/028_perk_intro_offers.sql). Default 'monthly'.
  frequency?: "monthly" | "once";
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
  // Usually one reference perk is enough to cover a redemption type
  // without the seed becoming its own perk-catalog to maintain — app-test
  // is the exception, carrying all three so Alex's own partner-portal
  // login always has one of every type to test against. [] = no perk
  // (e.g. "renske", deliberately, below).
  perks: ReferencePerk[];
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
    perks: [
      {
        title: "20% off your first Carry & Groove workshop",
        description: "New here? Get 20% off your first workshop — show this code at the front desk.",
        redemption_type: "code",
        redemption_code: "CARRYGROOVE20",
        exclusive: true,
        frequency: "once",
      },
    ],
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
    // Deliberately no perks — see the comment above REFERENCE_PARTNERS.
    perks: [],
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
    // All three redemption types on one partner, so Alex's own
    // partner-portal login (this is her inbox) always has one of each to
    // test against without hunting across the other reference partners.
    perks: [
      {
        title: "10% off a first consultation",
        description: "Mention Postpartum Post when you book for 10% off, every month.",
        redemption_type: "online",
        url: "https://amsterdamparentproject.nl",
        frequency: "monthly",
      },
      {
        title: "€10 off your welcome kit",
        description: "Enter this code at checkout for €10 off.",
        redemption_type: "code",
        redemption_code: "WELCOME10",
        frequency: "monthly",
      },
      {
        title: "Free 15-minute new-parent chat",
        description: "Just mention Postpartum Post when you stop by.",
        redemption_type: "in_person",
        frequency: "monthly",
      },
    ],
  },
  {
    // A well-known venue with real coordinates, so there's always a
    // reference partner whose perks show up on the match map. No portal
    // access — add more perks for it from /admin/partners.
    slug: "rijksmuseum",
    first_name: "Museum",
    last_name: "Guide",
    business_name: "Rijksmuseum",
    url: "https://www.rijksmuseum.nl",
    description: "The Netherlands' national museum of art and history, in the Museumkwartier.",
    email: null,
    location: {
      label: null,
      address: "Museumstraat 1, 1071 XX Amsterdam",
      area: "South",
      neighborhood: "Museumkwartier",
      latitude: 52.359997,
      longitude: 4.885219,
    },
    perks: [
      {
        title: "Free entry for you and your little one",
        description: "Show this screen at the ticket desk for free entry, once a month.",
        redemption_type: "in_person",
        frequency: "monthly",
      },
    ],
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

    const locationId = await syncReferenceLocation(partnerRow.id as string, p);
    await syncReferencePerks(partnerRow.id as string, locationId, p);

    console.log(`  - ${p.business_name} (${p.email ?? "no portal access"})`);
  }

  console.log(`\nDone inserting reference partners.`);
}

/**
 * Keeps each reference partner's location row STABLE across reruns (same
 * id), updating it in place when the address matches, instead of the old
 * delete-and-reinsert — a fresh row every run would silently detach every
 * perk from its location after each test run (perk_locations rows cascade
 * on the location's delete — db/migrations/031_perk_multi_location.sql).
 *
 * Coordinates come from the reference data when given, otherwise from the
 * same Nominatim lookup the app runs on save (lib/geocode.ts) — without
 * them the location never shows on the match map. Area/neighborhood fall
 * back to the lookup's suggestions the same way.
 */
async function syncReferenceLocation(partnerId: string, p: ReferencePartner): Promise<string | null> {
  const { data: existing } = await supabase
    .from("partner_locations")
    .select("id, address")
    .eq("partner_id", partnerId);

  if (!p.location) {
    await supabase.from("partner_locations").delete().eq("partner_id", partnerId);
    return null;
  }

  const keep = (existing ?? []).find((l) => l.address === p.location!.address);
  const stale = (existing ?? []).filter((l) => l.id !== keep?.id).map((l) => l.id);
  if (stale.length > 0) await supabase.from("partner_locations").delete().in("id", stale);

  let { latitude, longitude, neighborhood, area } = p.location;
  if (latitude == null || longitude == null) {
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max 1 request/second
    const geo = await geocodeAddress(p.location.address);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
      neighborhood = neighborhood ?? geo.neighborhood;
      area = area ?? geo.area;
    } else {
      console.warn(`  Couldn't geocode "${p.location.address}" — ${p.business_name} won't show on the map`);
    }
  }

  const row = {
    partner_id: partnerId,
    label: p.location.label,
    address: p.location.address,
    area,
    neighborhood: neighborhood ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
  };
  const { data: saved, error } = keep
    ? await supabase.from("partner_locations").update(row).eq("id", keep.id).select("id").single()
    : await supabase.from("partner_locations").insert(row).select("id").single();
  if (error || !saved) {
    console.error(`  Failed to save location for ${p.business_name}:`, error?.message);
    return keep?.id ?? null;
  }
  return saved.id as string;
}

/**
 * Same find-by-key, then update-or-insert pattern as the partner and
 * location syncs above, keyed on (partner_id, title). Always 'published'
 * / source 'manual' — these exist to be visible everywhere (admin queue,
 * partner portal, /perks, the match page) without a review step.
 *
 * Self-heals duplicates instead of assuming at most one match: an earlier
 * version used .maybeSingle(), which *throws* when more than one row
 * matches, silently making `existing` fall through to undefined and the
 * "no match" branch fire an INSERT — so once any duplicate existed (a
 * manual perk added by hand while testing, an interrupted run, whatever),
 * every subsequent run added one more instead of fixing it. Selecting
 * every match, keeping the oldest, and deleting the rest converges back
 * to exactly one perk per (partner, title) on the very next run,
 * regardless of how many accumulated before.
 */
async function syncReferencePerks(
  partnerId: string,
  locationId: string | null,
  p: ReferencePartner,
): Promise<void> {
  for (const perk of p.perks) {
    const { data: matches } = await supabase
      .from("perks")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("title", perk.title)
      .order("created_at", { ascending: true });

    const [keep, ...duplicates] = matches ?? [];
    if (duplicates.length > 0) {
      await supabase.from("perks").delete().in("id", duplicates.map((d) => d.id));
      console.log(`  - removed ${duplicates.length} duplicate "${perk.title}" row(s) for ${p.business_name}`);
    }

    const row = {
      partner_id: partnerId,
      status: "published" as const,
      source: "manual" as const,
      title: perk.title,
      description: perk.description,
      redemption_type: perk.redemption_type,
      redemption_code: perk.redemption_type === "code" ? perk.redemption_code ?? null : null,
      url: perk.url ?? null,
      exclusive: perk.exclusive ?? false,
      frequency: perk.frequency ?? "monthly",
    };

    let perkId = keep?.id as string | undefined;
    if (keep) {
      const { error } = await supabase.from("perks").update(row).eq("id", keep.id);
      if (error) console.error(`  Failed to save perk "${perk.title}" for ${p.business_name}:`, error.message);
    } else {
      const { data: inserted, error } = await supabase.from("perks").insert(row).select("id").single();
      if (error || !inserted) {
        console.error(`  Failed to save perk "${perk.title}" for ${p.business_name}:`, error?.message);
      } else {
        perkId = inserted.id as string;
      }
    }

    // Locations live in a join table since db/migrations/031_perk_multi_location.sql
    // -- a reference perk still gets at most the partner's one location, but
    // through the same delete-then-insert sync every save path uses.
    if (perkId) {
      await supabase.from("perk_locations").delete().eq("perk_id", perkId);
      if (locationId) {
        const { error } = await supabase.from("perk_locations").insert({ perk_id: perkId, location_id: locationId });
        if (error) console.error(`  Failed to link location for "${perk.title}" (${p.business_name}):`, error.message);
      }
    }
  }
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
