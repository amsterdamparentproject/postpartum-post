/**
 * Straight-line distance between two points, in km. Pure — safe on the
 * client (the match page ranks perks by distance) and the server
 * (lib/activities.ts ranks playgrounds the same way).
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Distance from `point` to the nearest of `points`, in km. Infinity when
 * there are none -- same "no coordinates" convention distanceKm callers
 * already use (e.g. a perk with no geocoded locations sorts last under
 * "Nearest").
 */
export function nearestKm(
  point: { lat: number; lng: number },
  points: { lat: number; lng: number }[],
): number {
  if (points.length === 0) return Infinity;
  return Math.min(...points.map((p) => haversineKm(point, p)));
}
