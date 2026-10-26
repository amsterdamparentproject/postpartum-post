import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Privacy scrubbing shared by every Sentry init (client, server, edge).
 *
 * Why this exists: `sendDefaultPii: false` does not strip URLs. Directory links
 * carry `?uid=` (effectively a credential), magic links carry tokens, and
 * error messages can contain parent email addresses. None of that should leave
 * for a third-party processor. Keep this file dependency-free so it runs in the
 * edge runtime too.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UID_RE =
  /([?&](?:uid|token|token_hash|code|access_token|refresh_token|member_id|member|match|sig|exp)=)[^&#\s"']+/gi;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(UID_RE, "$1[redacted]")
    .replace(UUID_RE, "[id]");
}

/** Drop the query string and fragment from a URL-ish string. */
function stripQuery(url: string): string {
  // Also mask UUIDs left in the path (e.g. /matches/<id>), so no record id
  // leaves the app.
  return url.split(/[?#]/)[0].replace(UUID_RE, "[id]");
}

const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept", "host"]);

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message);
  const data = breadcrumb.data;
  // Console breadcrumbs carry the raw console.log arguments (objects with
  // member/subscription ids, emails...). Keep the scrubbed message, drop them.
  if (data && breadcrumb.category === "console") delete data.arguments;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = stripQuery(data[key]);
    }
  }
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  const req = event.request;
  if (req) {
    if (req.url) req.url = stripQuery(req.url);
    delete req.query_string;
    delete req.cookies;
    delete req.data;
    if (req.headers) {
      // Allowlist, not denylist: Netlify adds client-IP headers
      // (x-nf-client-connection-ip, client-ip, ...) that a denylist would miss.
      const kept: Record<string, string> = {};
      for (const [h, v] of Object.entries(req.headers)) {
        const lower = h.toLowerCase();
        if (lower === "referer" || lower === "referrer") kept[h] = stripQuery(v);
        else if (SAFE_HEADERS.has(lower)) kept[h] = v;
      }
      req.headers = kept;
    }
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  if (event.message) event.message = scrubString(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubString(ex.value);
  }
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map(scrubBreadcrumb)
    .filter((b): b is Breadcrumb => b !== null);

  return event;
}

/** Noise that is never actionable for a content site. */
export const IGNORE_ERRORS = [
  "ResizeObserver loop",
  "Non-Error promise rejection captured",
  /^NEXT_(REDIRECT|NOT_FOUND)/,
];

export const DENY_URLS = [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i];
