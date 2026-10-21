"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client half of lib/turnstile.ts. Usage in a form:
 *
 *   const turnstile = useTurnstile();
 *   ...render {turnstile.widget} above the submit button
 *   ...disable the button while turnstile.pending
 *   ...send turnstile.token with the server action
 *   ...call turnstile.reset() after every submission attempt (a token works once)
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

export function useTurnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = Boolean(siteKey);
  // Held in state (not a plain ref) so the widget re-renders whenever its
  // container mounts again, e.g. a form that swaps to a thank-you card and back.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
            setFailed(false);
            setToken(t);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, container]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  const widget = enabled ? (
    <div>
      <div ref={setContainer} />
      {failed && (
        <p className="text-xs text-coral mt-1">
          We couldn&apos;t load the verification check. Please disable any content blockers for this page and
          refresh.
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
