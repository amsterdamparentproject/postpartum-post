import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' *.stripe.com cloud.umami.is challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' fonts.googleapis.com;
  img-src * blob: data:;
  connect-src *;
  font-src 'self' fonts.gstatic.com;
  frame-src 'self' js.stripe.com challenges.cloudflare.com;
`;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy.replace(/\n/g, ""),
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Short link for socials. Temporary (307) so it can be repointed later;
      // the query string (UTM tags) passes through.
      { source: "/dsa", destination: "/dutch-speaking-academy", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry (EU region). Token and project come from env so nothing secret is
// committed. Without SENTRY_AUTH_TOKEN the build skips source-map upload.
export default withSentryConfig(
  {
    ...nextConfig,
    env: {
      ...nextConfig.env,
      // Netlify's CONTEXT is "production" | "deploy-preview" | "branch-deploy".
      NEXT_PUBLIC_SENTRY_ENVIRONMENT:
        process.env.CONTEXT || process.env.NODE_ENV || "development",
    },
  },
  {
    org: "amsterdam-parent-project",
    project: process.env.SENTRY_PROJECT || "postpartum-post",
    // EU region: source-map upload must go to the EU host.
    sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    telemetry: false,
    widenClientFileUpload: true,

    // Send browser events through our own /monitoring route so ad blockers
    // don't drop them (the error-page reference depends on the event arriving).
    // proxy.ts only matches /admin/*, so it does not intercept this route.
    tunnelRoute: "/monitoring",

    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  }
);
