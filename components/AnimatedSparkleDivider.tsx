"use client";

import { useEffect, useRef, useState } from "react";
import Sparkle from "@/components/Sparkle";

/**
 * Sparkle divider that plays the shared .wiggle keyframe (app/globals.css)
 * once when scrolled into view, rather than on hover like SubscribeSection's
 * envelope or GiftBow's group-hover variant — there's nothing to hover on a
 * page that's just being scrolled past (or, on a short page like /perks,
 * something that's already in view on load).
 *
 * Originally built inline in PartnerSplash.tsx for its "What's a Post
 * Perk?" section; extracted here so any page carrying the same Post Perks
 * visual language (green wordmark + sparkle) reuses the exact same
 * animation instead of a copy drifting out of sync.
 */
export default function AnimatedSparkleDivider({ className = "w-20 h-auto" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wiggling, setWiggling] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWiggling(true);
          // Reset once the animation finishes so scrolling away and back
          // (or a later remount) can retrigger it.
          setTimeout(() => setWiggling(false), 550);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center mb-4">
      <Sparkle className={`${className}${wiggling ? " wiggle" : ""}`} />
    </div>
  );
}
