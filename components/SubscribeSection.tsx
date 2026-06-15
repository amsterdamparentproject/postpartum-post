"use client";

import { useState } from "react";
import SignupForm from "@/components/SignupForm";
import EnvelopeLogo from "@/components/EnvelopeLogo";

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
      <div className="flex justify-center mb-6">
        <div className={wiggling ? "wiggle" : undefined}>
          <EnvelopeLogo width={66} height={49} />
        </div>
      </div>
      <h2
        className="text-xl text-dark mb-1"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Receive your monthly Post
      </h2>
      <p className="text-sm text-muted mb-6">
        Your first match arrives within the month. Once you&apos;re subscribed, check your inbox for your first letter!
      </p>
      <SignupForm
        first20SpotsRemaining={first20SpotsRemaining}
        pilotOnly={pilotOnly}
        onSubmitHover={handleHover}
      />
      <p className="text-xs text-muted text-center mt-4 leading-relaxed">
        Skip a month without guilt — we extend your subscription automatically. Cancel anytime.
      </p>
    </>
  );
}
