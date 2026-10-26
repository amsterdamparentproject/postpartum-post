import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry/options";

// Edge runtime. Post has no edge routes today (proxy.ts runs on Node in Next
// 16), but instrumentation.ts imports this when NEXT_RUNTIME === "edge".
Sentry.init({
  ...sharedSentryOptions,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
});
