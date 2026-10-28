"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { generateDevMatch } from "@/app/actions/dev-match";
import { DEV_DISTANCES, DEV_SCENARIOS, type DevDistance, type DevScenario } from "@/lib/dev-tools";

/**
 * Dev-only panel (rendered only when the loader says devTools). Rebuilds the
 * test match for the chosen member type and distance, then loads it.
 */
export default function DevMatchTools() {
  const [scenario, setScenario] = useState<DevScenario>("cohort_comped");
  const [distance, setDistance] = useState<DevDistance>("local");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const { data: { session } } = await createBrowserClient().auth.getSession();
      if (!session?.access_token) {
        setError("Not signed in.");
        return;
      }
      const result = await generateDevMatch(session.access_token, scenario, distance);
      if (result.success) {
        window.location.assign(result.path);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <details className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border border-border bg-white shadow-lg text-sm">
      <summary className="cursor-pointer select-none px-4 py-2 font-medium text-dark">🧪 Test match generator</summary>
      <div className="space-y-4 border-t border-border px-4 py-3">
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted mb-1">Member types</legend>
          {(Object.keys(DEV_SCENARIOS) as DevScenario[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-dark">
              <input type="radio" name="dev-scenario" checked={scenario === key} onChange={() => setScenario(key)} />
              {DEV_SCENARIOS[key].label}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted mb-1">My match lives…</legend>
          {(Object.keys(DEV_DISTANCES) as DevDistance[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-dark">
              <input type="radio" name="dev-distance" checked={distance === key} onChange={() => setDistance(key)} />
              {DEV_DISTANCES[key]}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="w-full rounded-lg bg-coral text-white py-2 font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? "Generating…" : "Generate match"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-xs text-muted">
          Changes your test account&apos;s cohort and plan. &quot;No cohort, subscriber&quot; puts it back to normal.
        </p>
      </div>
    </details>
  );
}
