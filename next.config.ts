import type { NextConfig } from "next";

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' *.stripe.com cloud.umami.is;
  style-src 'self' 'unsafe-inline' fonts.googleapis.com;
  img-src * blob: data:;
  connect-src *;
  font-src 'self' fonts.gstatic.com;
  frame-src 'self' js.stripe.com;
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

export default nextConfig;
