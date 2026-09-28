import { describe, it, expect } from "vitest";
import { haversineKm, nearestKm } from "@/lib/geo-distance";

describe("nearestKm", () => {
  const point = { lat: 52.36, lng: 4.88 }; // roughly central Amsterdam

  it("is Infinity with no points", () => {
    expect(nearestKm(point, [])).toBe(Infinity);
  });

  it("picks the closest of several points", () => {
    const near = { lat: 52.361, lng: 4.881 };
    const far = { lat: 52.5, lng: 5.1 };
    expect(nearestKm(point, [far, near])).toBeCloseTo(haversineKm(point, near), 5);
  });
});
