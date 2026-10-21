"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportTurnstileOutcome, type TurnstileOutcome } from "@/app/actions/turnstile-report";

/**
 * Client half of lib/turnstile.ts. Usage in a form:
 *
 *   const turnstile = useTurnstile();
 *   ...render {turnstile.widget} above the submit button
 *   ...disable the button while turnstile.pending
 *   ...send turnstile.token with the server action
 *   ...call turnstile.reset() after every submission attempt (a token works once)
 *
 * Pass the form name ("signup" | "partner_lead" | "perk_idea"); outcomes are
 * counted per form by app/actions/turnstile-report.ts.
 *
 * With no NEXT_PUBLIC_TURNSTILE_SITE_KEY the widget renders nothing and
 * never blocks the form. The script is loaded straight from Cloudflare, as
 * their docs require.
 */

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Could not load Turnstile"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export function useTurnstile(form: "signup" | "partner_lead" | "perk_idea") {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = Boolean(siteKey);
  // Held in state (not a plain ref) so the widget re-renders whenever its
  // container mounts again, e.g. a form that swaps to a thank-you card and back.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // "blocked": the Cloudflare script never loaded (often an ad/privacy blocker).
  // "error": the widget loaded but could not run (e.g. the domain is not allowed).
  const [problem, setProblem] = useState<"blocked" | "error" | null>(null);
  // One passed/blocked/error outcome per visit, so the counts are per visitor.
  const reported = useRef(false);
  const report = useCallback(
    (outcome: TurnstileOutcome) => {
      void reportTurnstileOutcome(outcome, form, window.location.pathname).catch(() => {});
    },
    [form],
  );
  const reportOnce = useCallback(
    (outcome: TurnstileOutcome) => {
      if (reported.current) return;
      reported.current = true;
      report(outcome);
    },
    [report],
  );

  useEffect(() => {
    if (!siteKey || !container) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container, {
          sitekey: siteKey,
          size: "flexible",
          theme: "light",
          // Hidden unless Cloudflare needs a checkbox, so most visitors see nothing.
          appearance: "interaction-only",
          callback: (t: string) => {
            setProblem(null);
            setToken(t);
            reportOnce("passed");
          },
          // Cloudflare decided it needs a click after all.
          "before-interactive-callback": () => report("checkbox"),
          "expired-callback": () => setToken(null),
          "error-callback": (code: unknown) => {
            // Cloudflare error codes are for us, not visitors (e.g. 110200 = domain not allowed).
            console.warn("[turnstile] widget error", code);
            setToken(null);
            setProblem("error");
            reportOnce("error");
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setProblem("blocked");
          reportOnce("blocked");
        }
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, container, report, reportOnce]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  const widget = enabled ? (
    <div>
      <div ref={setContainer} />
      {problem === "blocked" && (
        <p className="text-xs text-coral mt-1">
          We couldn&apos;t run our security check. If you use an ad or privacy blocker, try turning it off for
          this page, then refresh. Still stuck? Email us at{" "}
          <a href="mailto:post@amsterdamparentproject.nl" className="underline">
            post@amsterdamparentproject.nl
          </a>
          .
        </p>
      )}
      {problem === "error" && (
        <p className="text-xs text-coral mt-1">
          Something went wrong with our security check. Please refresh the page and try again. Still stuck?
          Email us at{" "}
          <a href="mailto:post@amsterdamparentproject.nl" className="underline">
            post@amsterdamparentproject.nl
          </a>
          .
        </p>
      )}
    </div>
  ) : null;

  return {
    enabled,
    /** The one-time token to send with the form; undefined until the check passes. */
    token: token ?? undefined,
    /** True while the form must wait for the check to finish. */
    pending: enabled && !token,
    reset,
    widget,
  };
}
