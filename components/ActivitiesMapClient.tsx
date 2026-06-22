"use client";

import dynamic from "next/dynamic";
import type { Activity } from "@/lib/activities";

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
}: {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
  memberCoords: { lat: number; lng: number }[];
}) {
  return <ActivitiesMap activities={activities} center={center} memberCoords={memberCoords} />;
}
