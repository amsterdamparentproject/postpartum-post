"use client";

import { useState } from "react";
import SignupForm from "@/components/SignupForm";
import { EnvelopeStamp } from "@/components/StampIcons";

export default function SubscribeSection({
  first20SpotsRemaining,
  pilotOnly,
}: {
  first20SpotsRemaining?: number | null;
  pilotOnly?: boolean;
}) {
  const [wiggling, setWiggling] = useState(false);

  function handleHover(hovering: boolean) {
    if (hovering) {
      setWiggling(true);
    } else {
      // Let the animation finish before resetting so re-hovering retriggers it
      setTimeout(() => setWiggling(false), 550);
    }
  }

  return (
    <>
      <div className="flex justify-center mb-4">
        <div className={wiggling ? "wiggle" : undefined}>
          <EnvelopeStamp />
        </div>
      </div>
      <h2
        className="text-xl font-semibold text-dark mb-1"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Receive your monthly Post
      </h2>
      <p className="text-sm text-muted mb-6">
        Once you&apos;re subscribed, check your inbox for your first postcard!
      </p>
      <SignupForm
        first20SpotsRemaining={first20SpotsRemaining}
        pilotOnly={pilotOnly}
        onSubmitHover={handleHover}
      />
    </>
  );
}
