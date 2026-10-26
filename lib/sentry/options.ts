import { DENY_URLS, IGNORE_ERRORS, scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * Options shared by every Sentry.init (client, server, edge) in every app.
 *
 * Sentry SDK v11 replaced `sendDefaultPii` with `dataCollection`, and its
 * defaults collect nearly everything (cookies, headers, query params, request
 * bodies, DB query data, stack-frame local variables). So privacy here is
 * opt-in: everything is switched off explicitly, and `scrubEvent` is a second
 * layer for what remains (URLs, messages, breadcrumbs).
 */
export const sharedSentryOptions = {
  tracesSampleRate: 0, // errors only for now
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  ignoreErrors: IGNORE_ERRORS,
  denyUrls: DENY_URLS,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
