/**
 * Backfill lat/lng for members who have a zipcode but no coordinates.
 *
 * Usage:
 *   yarn geo:test    # runs against .env.test
 *   yarn geo:prod    # runs against .env.production
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const env = process.argv[2];
if (env !== "test" && env !== "prod") {
  console.error("Usage: npx tsx scripts/backfill-geo.ts <test|prod>");
  process.exit(1);
}

const envFile = env === "prod" ? ".env.production" : ".env.test";
config({ path: resolve(process.cwd(), envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function geocodeZipcode(
  zipcode: string
): Promise<{ lat: number; lng: number } | null> {
  const normalised = zipcode.replace(/\s+/g, "").slice(0, 6);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("postalcode", normalised);
  url.searchParams.set("countrycodes", "NL");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "PostpartumPost/1.0 (amsterdamparentproject@gmail.com)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Backfilling geo coordinates (${env} / ${envFile})…`);

  const { data: members, error } = await supabase
    .from("members")
    .select("id, zipcode")
    .not("zipcode", "is", null)
    .or("lat.is.null,lng.is.null");

  if (error) {
    console.error("Failed to fetch members:", error.message);
    process.exit(1);
  }

  if (!members?.length) {
    console.log("No members need geocoding.");
    return;
  }

  console.log(`Found ${members.length} member(s) to geocode.`);

  // Deduplicate zipcodes to minimize Nominatim requests
  const zipToCoord = new Map<string, { lat: number; lng: number } | null>();
  const uniqueZips = [...new Set(members.map((m) => m.zipcode as string))];

  for (let i = 0; i < uniqueZips.length; i++) {
    const zip = uniqueZips[i];
    process.stdout.write(`  Geocoding ${zip} (${i + 1}/${uniqueZips.length})… `);
    const coord = await geocodeZipcode(zip);
    zipToCoord.set(zip, coord);
    console.log(coord ? `${coord.lat}, ${coord.lng}` : "not found");
    if (i < uniqueZips.length - 1) await sleep(1_100); // Nominatim 1 req/sec
  }

  // Write back to DB
  let updated = 0;
  let failed = 0;

  await Promise.all(
    members.map(async (m) => {
      const coord = zipToCoord.get(m.zipcode as string) ?? null;
      if (!coord) { failed++; return; }

      const { error: updateError } = await supabase
        .from("members")
        .update({ lat: coord.lat, lng: coord.lng })
        .eq("id", m.id);

      if (updateError) {
        console.error(`  Failed to update member ${m.id}:`, updateError.message);
        failed++;
      } else {
        updated++;
      }
    })
  );

  console.log(`\nDone. Updated: ${updated}, failed/not found: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
