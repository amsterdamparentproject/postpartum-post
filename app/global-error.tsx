"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { buildReportHref } from "@/lib/sentry/report";

/**
 * Last-resort error boundary (replaces the whole document), also the catch-all
 * for client render errors. Shows a short reference and a prefilled email so a
 * member can send us exactly what we need to find the error in Sentry.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string>();

  useEffect(() => {
    console.error(error);
    setEventId(
      Sentry.captureException(error, error.digest ? { tags: { digest: error.digest } } : undefined)
    );
  }, [error]);

  const reportHref = buildReportHref({
    to: "post@amsterdamparentproject.nl",
    product: "Postpartum Post",
    eventId,
    digest: error?.digest,
  });

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1>We hit a snag</h1>
        <p style={{ maxWidth: "28rem" }}>
          Sorry, that didn&apos;t work. You can try again, or send us a quick
          note and we&apos;ll sort it out.
        </p>
        <p style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button onClick={reset}>Try again</button>
          <a href={reportHref}>Email us about this</a>
        </p>
        {eventId && (
          <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            Reference: {eventId.slice(0, 8)}
          </p>
        )}
      </body>
    </html>
  );
}
