"use client";

import { useState } from "react";
import type { MatchMemberView } from "@/app/actions/match-page";

/**
 * The two member cards at the top of a match page: name, availability, and
 * (for the real page) an edit-availability link and a copy-email button.
 * `preview` strips the interactive bits for the homepage example match
 * (components/MatchPreview.tsx), which shows fictional members.
 */
export default function MatchCards({
  members,
  preview = false,
}: {
  members: [MatchMemberView, MatchMemberView];
  preview?: boolean;
}) {
  return (
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {members.map((member, i) => {
          const days = member.availability?.days ?? [];
          const dayLabels = days.map((d) =>
            d.charAt(0).toUpperCase() + d.slice(1, 3).toLowerCase()
          );
          const borderColor = i === 0 ? "#C56850" : "#9B7355";
          const radius = i === 0
            ? "2rem 0.5rem 2rem 0.5rem / 0.5rem 2rem 0.5rem 2rem"
            : "0.5rem 2rem 0.5rem 2rem / 2rem 0.5rem 2rem 0.5rem";
          return (
            <div
              key={i}
              className="p-5 bg-white space-y-2"
              style={{ borderRadius: radius, border: `1.5px solid ${borderColor}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-dark text-lg" style={{ fontFamily: "var(--font-serif)" }}>
                  {`${member.first_name} ${member.last_name}`.trim()}
                </p>
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shrink-0"
                  style={{ background: borderColor }}
                >
                  {member.first_name[0].toUpperCase()}
                </span>
              </div>
              <p className="text-muted text-xs flex items-center gap-1">
                {dayLabels.length > 0
                  ? `Available on: ${dayLabels.join(", ")}`
                  : "Available on: Not specified"
                }
                {!preview && (
                <a href="/profile" title="Edit availability" target="_blank" rel="noopener noreferrer" style={{ color: borderColor }} className="ml-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </a>
                )}
              </p>
              {!preview && <CopyEmailButton email={member.email} />}
            </div>
          );
        })}
      </section>
  );
}

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-coral hover:underline text-xs block"
    >
      {copied ? "Copied!" : "Copy contact email"}
    </button>
  );
}
