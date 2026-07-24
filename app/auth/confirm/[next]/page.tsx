import { Suspense } from "react";
import ConfirmHandler, { Spinner } from "../ConfirmHandler";
import { decodeNextParam } from "@/lib/next-param";

/**
 * GET /auth/confirm/[next]
 *
 * `next` is the final post-sign-in destination (e.g. "/profile",
 * "/billing", "/matches/abc123?token=xyz"), base64url-encoded as a single
 * path segment via encodeNextParam (lib/next-param.ts) — never as a
 * `?next=` query param, and never with plain encodeURIComponent either.
 *
 * Why not a query param: the shared email template (site/emails/shared/signin.html)
 * builds the link as `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink`
 * — a fixed, un-editable-from-here `?...` suffix appended to whatever
 * `RedirectTo` (the `emailRedirectTo`/`redirectTo` passed to signInWithOtp)
 * resolves to. If `RedirectTo` itself already contains a `?` (as
 * `/auth/confirm?next=/profile` does), the result is a URL with two bare
 * `?` characters — only the first is a real query-string separator, so
 * `token_hash`/`type` end up swallowed into the *value* of `next` instead
 * of being their own params.
 *
 * Why not plain encodeURIComponent either: every `next` value starts with
 * "/", so encodeURIComponent always produces a leading %2F — an encoded
 * slash inside a single dynamic route segment. Confirmed in practice that
 * this breaks: /auth/confirm/%2Fprofile still landed on "Invalid sign-in
 * link" despite a well-formed query string, almost certainly because %2F
 * gets normalized back into a literal "/" somewhere between the browser
 * and Next.js's router, silently splitting one segment into two. base64url
 * output only contains [A-Za-z0-9_-] — nothing for any layer to
 * misinterpret as a path separator.
 */
export default async function AuthConfirmWithNextPage({
  params,
}: {
  params: Promise<{ next: string }>;
}) {
  const { next: encodedNext } = await params;
  const next = decodeNextParam(encodedNext);

  return (
    <Suspense fallback={<Spinner />}>
      <ConfirmHandler next={next} />
    </Suspense>
  );
}
