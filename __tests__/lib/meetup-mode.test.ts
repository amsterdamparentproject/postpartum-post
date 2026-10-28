import { describe, it, expect } from "vitest";
import { getMeetupMode, LOCAL_MEETUP_KM } from "@/lib/meetup-mode";
import { haversineKm } from "@/lib/geo-distance";

const AMSTERDAM = { lat: 52.3676, lng: 4.9041 };
const AMSTELVEEN = { lat: 52.308, lng: 4.8722 }; // ~7 km
const HAARLEM = { lat: 52.3874, lng: 4.6462 }; // ~18 km
const ROTTERDAM = { lat: 51.9244, lng: 4.4777 }; // ~57 km

describe("getMeetupMode", () => {
  it("uses a 10 km cutoff", () => {
    expect(LOCAL_MEETUP_KM).toBe(10);
  });

  it("is local when the pair lives within 10 km", () => {
    expect(haversineKm(AMSTERDAM, AMSTELVEEN)).toBeLessThan(10);
    expect(getMeetupMode(AMSTERDAM, AMSTELVEEN)).toBe("local");
  });

  it("is local for the same spot", () => {
    expect(getMeetupMode(AMSTERDAM, AMSTERDAM)).toBe("local");
  });

  it("is online beyond 10 km", () => {
    expect(haversineKm(AMSTERDAM, HAARLEM)).toBeGreaterThan(10);
    expect(getMeetupMode(AMSTERDAM, HAARLEM)).toBe("online");
    expect(getMeetupMode(AMSTERDAM, ROTTERDAM)).toBe("online");
  });

  it("treats exactly the cutoff as local", () => {
    const d = haversineKm(AMSTERDAM, HAARLEM);
    expect(getMeetupMode(AMSTERDAM, HAARLEM, d)).toBe("local");
    expect(getMeetupMode(AMSTERDAM, HAARLEM, d - 0.001)).toBe("online");
  });

  it("is order-independent", () => {
    expect(getMeetupMode(ROTTERDAM, AMSTERDAM)).toBe(getMeetupMode(AMSTERDAM, ROTTERDAM));
  });

  it("is unknown when either member has no location", () => {
    expect(getMeetupMode({ lat: null, lng: null }, AMSTERDAM)).toBe("unknown");
    expect(getMeetupMode(AMSTERDAM, { lat: undefined, lng: undefined })).toBe("unknown");
    expect(getMeetupMode({ lat: 52.3, lng: null }, AMSTERDAM)).toBe("unknown");
    expect(getMeetupMode({ lat: null, lng: null }, { lat: null, lng: null })).toBe("unknown");
  });

  it("treats a 0,0 coordinate as a real location, not a missing one", () => {
    expect(getMeetupMode({ lat: 0, lng: 0 }, AMSTERDAM)).toBe("online");
  });
});
