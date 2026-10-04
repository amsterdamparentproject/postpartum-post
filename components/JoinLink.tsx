"use client";

import Link from "next/link";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const DESKTOP_QUERY = "(hover: hover) and (pointer: fine)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * A link to the homepage plans (/#subscribe) from /perks that opens in a new
 * tab on desktop, so the page the visitor is on (the giveaway form, say)
 * stays put, but in the same tab on phones, where a second tab is easy to
 * lose. Same tab until hydrated and on the server, so there's no mismatch.
 */
export default function JoinLink({
  children,
  className,
  style,
  umamiEvent,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  umamiEvent?: string;
}) {
  const newTab = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
  return (
    <Link
      href="/#subscribe"
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      data-umami-event={umamiEvent}
      className={className}
      style={style}
    >
      {children}
    </Link>
  );
}
