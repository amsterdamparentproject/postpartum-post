"use client";

import dynamic from "next/dynamic";
import type { Activity, Playground } from "@/lib/activities";
import type { MapPerk } from "@/components/ActivitiesMap";

const ActivitiesMap = dynamic(() => import("@/components/ActivitiesMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: "320px", borderRadius: "12px" }}
      className="bg-border/30 animate-pulse"
    />
  ),
});

export default function ActivitiesMapClient({
  activities,
  center,
  memberCoords,
  playgrounds,
  perks,
  preview,
}: {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
  memberCoords: { lat: number; lng: number }[];
  playgrounds?: Playground[];
  perks?: MapPerk[];
  preview?: boolean;
}) {
  return (
    <ActivitiesMap
      activities={activities}
      center={center}
      memberCoords={memberCoords}
      playgrounds={playgrounds}
      perks={perks}
      preview={preview}
    />
  );
}
