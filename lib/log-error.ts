import * as Sentry from "@sentry/nextjs";

/**
 * Report a handled error to Sentry. Use this in catch blocks that swallow the
 * error (webhooks, cron routes), because Sentry only sees errors that escape.
 *
 * Deliberately narrow, so nothing personal can slip in:
 *  - `code` is a stable "area.what" string, e.g. "billing.renew.failed".
 *  - `memberId` is the opaque member id, the only identifier we send.
 *  - There is no free-text/extra-data parameter. Never add one.
 *
 * Never throws and never blocks billing: logging failures are swallowed.
 * Returns the Sentry event id (also usable as a support reference).
 */
export async function logError(
  code: string,
  error: unknown,
  opts: { memberId?: string } = {}
): Promise<string | undefined> {
  try {
    const err = error instanceof Error ? error : new Error("Non-Error value thrown");
    const eventId = Sentry.withScope((scope) => {
      scope.setTag("code", code);
      scope.setLevel("error");
      if (opts.memberId) scope.setUser({ id: opts.memberId });
      return Sentry.captureException(err);
    });
    // Serverless functions can freeze right after the response; wait for send.
    await Sentry.flush(2000);
    return eventId;
  } catch {
    return undefined;
  }
}
