/**
 * Read-back of emails the app sent through Resend.
 *
 * E2E members use `delivered+<label>@resend.dev` addresses (see testEmail() in
 * e2e/helpers/db.ts): Resend accepts those sends and logs them, but delivers
 * to no inbox. This helper fetches the logged message through Resend's REST
 * API so a spec can assert on the real rendered subject, HTML and links.
 *
 * Needs RESEND_API_KEY in .env.local with full access. A sending-only key can
 * send but not list/retrieve, and the helper fails with a clear message.
 * Resend allows ~2 requests/second, so polling stays slower than that.
 */

const API = "https://api.resend.com";
const POLL_MS = 1500;

export interface SentEmail {
  id: string;
  to: string[];
  subject: string;
  html: string;
  createdAt: string;
}

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY in .env.local");
  return key;
}

async function resend<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Resend refused the request (${res.status}). RESEND_API_KEY needs full access to read sent emails, not sending-only.`
      );
    }
    if (!res.ok) throw new Error(`Resend ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }
  throw new Error(`Resend ${path} kept answering 429`);
}

/**
 * Waits for an email to `to` whose subject contains `subjectIncludes`, sent at
 * or after `since`, and returns it with its HTML. Matching on recipient plus
 * `since` keeps repeated runs from reading each other's mail.
 */
export async function waitForEmail(opts: {
  to: string;
  subjectIncludes: string;
  since: Date;
  timeoutMs?: number;
}): Promise<SentEmail> {
  const { to, subjectIncludes, since, timeoutMs = 45_000 } = opts;
  const wanted = to.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  // Resend's created_at has second precision and its clock can differ a little
  // from ours, so allow a few seconds of slack; the unique recipient does the
  // real filtering.
  const earliest = since.getTime() - 5_000;

  for (;;) {
    const list = await resend<{
      data: { id: string; to: string[]; subject: string; created_at: string }[];
    }>("/emails?limit=50");

    const hit = list.data.find(
      (e) =>
        e.to.some((addr) => addr.toLowerCase() === wanted) &&
        e.subject.includes(subjectIncludes) &&
        new Date(e.created_at).getTime() >= earliest
    );
    if (hit) {
      const full = await resend<{ html: string | null }>(`/emails/${hit.id}`);
      return { id: hit.id, to: hit.to, subject: hit.subject, html: full.html ?? "", createdAt: hit.created_at };
    }

    if (Date.now() > deadline) {
      throw new Error(`No email to ${to} with subject containing "${subjectIncludes}" appeared within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Every href in an email's HTML, decoded of &amp;. */
export function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}
