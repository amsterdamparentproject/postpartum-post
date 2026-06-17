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
}: {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
}) {
  return <ActivitiesMap activities={activities} center={center} />;
}
