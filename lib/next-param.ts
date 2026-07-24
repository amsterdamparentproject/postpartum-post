/**
 * Encodes/decodes the `next` (post-sign-in destination) path used by
 * /auth/confirm/[next] as a base64url string, NOT encodeURIComponent.
 *
 * Why: every `next` value starts with "/", so encodeURIComponent always
 * produces a leading %2F — an encoded slash inside a single dynamic route
 * segment. That's a known trouble spot: %2F can get normalized back into a
 * literal "/" somewhere between the browser and Next.js's router, silently
 * turning one segment into two (or breaking the match outright). Confirmed
 * in practice — /auth/confirm/%2Fprofile still landed on "Invalid sign-in
 * link" despite the query string being well-formed.
 *
 * base64url output only ever contains [A-Za-z0-9_-], so there's nothing
 * for any layer to misinterpret as a path separator. Uses the WHATWG
 * atob/btoa globals, available in both the browser (client components
 * that build the redirect URL) and the Node runtime Next.js server
 * components run on (the [next]/page.tsx route that decodes it) — no
 * Buffer import needed on either side.
 */

export function encodeNextParam(path: string): string {
  return btoa(path)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeNextParam(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padLength));
}
