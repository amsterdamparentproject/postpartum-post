/**
 * Shared Nominatim (OpenStreetMap) geocoding — first shared geocode helper
 * in this repo. Until now geocodeAddress() only existed inline in Desk's
 * app/utils/geocode.ts (activities.events/locations) and in this repo's own
 * scripts/backfill-geo.ts (members, by zipcode). Same free endpoint, same
 * required User-Agent per Nominatim's usage policy.
 *
 * Extends Desk's version in one way: requests addressdetails=1 instead of
 * addressdetails=0, so the response carries Nominatim's structured address
 * breakdown (city_district / suburb / neighbourhood) — not AI, just data
 * today's calls simply don't ask for. That's what backs the non-AI
 * area/neighborhood auto-suggestion below.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "AmsterdamParentProject/1.0 (amsterdamparentproject@gmail.com)";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Best-effort suggestion from Nominatim's district tag, mapped onto the
   *  fixed Amsterdam-area vocabulary Desk's own LocationDrawer/ActivityDrawer/
   *  CaptureCardForm already use (West/East/North/Center/South). Never
   *  Everywhere/Online — those are only ever picked by a human, for perks
   *  with no single geographic home. Null when nothing maps confidently. */
  area: string | null;
  /** Best-effort suggestion from Nominatim's finer suburb/neighbourhood tag
   *  (e.g. "Jordaan", "De Pijp"), free text, as-is. Null when absent. */
  neighborhood: string | null;
}

interface NominatimAddress {
  city_district?: string;
  borough?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

/**
 * Maps an Amsterdam stadsdeel/district name (as Nominatim tags it, e.g.
 * "Amsterdam-Zuidoost", "Amsterdam-Nieuw-West") onto the fixed 7-value
 * area vocabulary. Deliberately narrow: only maps what it's confident
 * about, leaves everything else null rather than guessing — this is a
 * starting suggestion an admin/partner can always correct, never a fact.
 */
function mapDistrictToArea(district: string | undefined): string | null {
  if (!district) return null;
  const normalized = district
    .toLowerCase()
    .replace(/^amsterdam[\s-]*/, "")
    .trim();

  if (normalized.startsWith("centrum")) return "Center";
  if (normalized.startsWith("noord")) return "North";
  if (normalized.startsWith("zuidoost")) return "South"; // no exact match — nearest of the 7
  if (normalized.startsWith("zuid")) return "South";
  if (normalized.startsWith("oost")) return "East";
  if (normalized.startsWith("nieuw-west") || normalized.startsWith("nieuw west")) return "West"; // nearest of the 7
  if (normalized.startsWith("west")) return "West";

  return null;
}

/**
 * Geocodes a free-text address via Nominatim, returning coordinates plus a
 * best-effort area/neighborhood suggestion. Returns null on any failure
 * (empty address, network error, no results) — callers should treat that
 * as "nothing to suggest yet," not an error to surface to the person
 * filling out a form.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address?.trim()) return null;

  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const result = data[0];
    const addr = result.address ?? {};
    const district = addr.city_district ?? addr.borough;
    const neighborhood = addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? null;

    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      area: mapDistrictToArea(district),
      neighborhood,
    };
  } catch {
    return null;
  }
}
