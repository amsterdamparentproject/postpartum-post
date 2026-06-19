"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { Activity } from "@/lib/activities";

interface Props {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
  /** Member coordinates used only for bounds fitting — no markers rendered */
  memberCoords: { lat: number; lng: number }[];
}

const COLORS = {
  recPlace:    "#D4E09B", // green — recommended places
  recActivity: "#AF99FF", // purple — recommended things to do
  location:    "#C56850", // coral — non-recommended places
  activity:    "#AF99FF", // purple — non-recommended things to do
};

function makeMarkerHtml(activity: Activity): string {
  const bg = activity.isRecommended
    ? (activity.kind === "location" ? COLORS.recPlace : COLORS.recActivity)
    : (activity.kind === "location" ? COLORS.location : COLORS.activity);

  if (activity.isRecommended) {
    return `<div style="
      width: 28px; height: 28px;
      background: ${bg};
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; line-height: 1;
    ">★</div>`;
  }
  return `<div style="
    width: 14px; height: 14px;
    background: ${bg};
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  "></div>`;
}

function makePopupHtml(activity: Activity): string {
  const loc = activity.location ?? activity.neighborhood ?? activity.area ?? null;
  const org = activity.organization;
  const meta = [org, loc].filter(Boolean).join(" · ");
  const dateStr =
    activity.kind === "event" && activity.start_date
      ? new Date(activity.start_date).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        })
      : null;

  return `
    <div style="font-size:13px;line-height:1.6;min-width:160px;max-width:220px">
      <strong style="font-size:14px">${activity.title}</strong>
      ${meta ? `<br/><span style="color:#8B7B72">${meta}</span>` : ""}
      ${dateStr ? `<br/><span style="color:#8B7B72">${dateStr}</span>` : ""}
      ${activity.url ? `<br/><a href="${activity.url}" target="_blank" rel="noopener noreferrer" style="color:#C56850">More info →</a>` : ""}
    </div>
  `;
}

export default function ActivitiesMap({ activities, center, memberCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const defaultCenter: [number, number] = center
    ? [center.lat, center.lng]
    : [52.374, 4.89];

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      // Fit bounds to recommended markers; fall back to all activities, then member coords
      const recCoords = activities
        .filter((a) => a.isRecommended && a.lat != null && a.lng != null)
        .map((a) => [a.lat!, a.lng!] as [number, number]);
      const allCoords = activities
        .filter((a) => a.lat != null && a.lng != null)
        .map((a) => [a.lat!, a.lng!] as [number, number]);
      const boundsCoords = recCoords.length > 0 ? recCoords
        : allCoords.length > 0 ? allCoords
        : memberCoords.map((c) => [c.lat, c.lng] as [number, number]);
      if (boundsCoords.length > 0) {
        map.fitBounds(L.latLngBounds(boundsCoords), { padding: [64, 64], maxZoom: 15 });
      }

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      // Sort so recommended markers render on top
      const sorted = [...activities].sort((a, b) =>
        a.isRecommended === b.isRecommended ? 0 : a.isRecommended ? 1 : -1,
      );

      for (const activity of sorted) {
        if (activity.lat == null || activity.lng == null) continue;
        const isRec = activity.isRecommended;
        const size = isRec ? 28 : 14;
        const icon = L.divIcon({
          className: "",
          html: makeMarkerHtml(activity),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        L.marker([activity.lat, activity.lng], { icon })
          .bindPopup(makePopupHtml(activity), { maxWidth: 240 })
          .addTo(map);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "320px", borderRadius: "12px", overflow: "hidden" }}
    />
  );
}
