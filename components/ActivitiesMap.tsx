"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { Activity, Playground } from "@/lib/activities";
import { formatPlaygroundType } from "@/lib/activities";

interface Props {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
  /** Member coordinates used only for bounds fitting — no markers rendered */
  memberCoords: { lat: number; lng: number }[];
  playgrounds?: Playground[];
}

const COLORS = {
  location: "#D4E09B",  // green — places
  activity: "#AF99FF",  // purple — things to do
  playground: "#D4A373", // tan — playgrounds
};

/**
 * Groups items sharing the exact same coordinates (e.g. two events at the
 * same venue) so they render as a single marker with a combined popover,
 * instead of stacking invisibly on top of one another.
 */
function groupByCoord<T extends { lat: number | null; lng: number | null }>(
  items: T[],
): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue;
    const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.values()];
}

function makeGroupedMarkerHtml(bg: string, count: number): string {
  return `<div style="
    width: 28px; height: 28px;
    background: ${bg};
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: white;
  ">${count > 1 ? count : ""}</div>`;
}

function makePopupItemHtml(activity: Activity): string {
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
    <div>
      <strong style="font-size:14px;color:#242424">${activity.title}</strong>
      ${meta ? `<br/><span>${meta}</span>` : ""}
      ${dateStr ? `<br/><span>${dateStr}</span>` : ""}
      ${activity.url ? `<br/><a href="${activity.url}" target="_blank" rel="noopener noreferrer" style="color:#C56850">More info →</a>` : ""}
    </div>
  `;
}

function makePopupHtml(group: Activity[]): string {
  const items = group
    .map(makePopupItemHtml)
    .join(`<hr style="margin:8px 0;border:none;border-top:1px solid #eee" />`);

  return `
    <div style="font-size:13px;line-height:1.6;min-width:160px;max-width:240px;max-height:220px;overflow-y:auto;color:#8B7B72">
      ${group.length > 1 ? `<div style="font-size:11px;font-weight:700;color:#C56850;margin-bottom:6px;">${group.length} things here</div>` : ""}
      ${items}
    </div>
  `;
}

function makePlaygroundPopupItemHtml(p: Playground): string {
  const typeLabel = formatPlaygroundType(p.playground_type);
  const distLabel = p.distanceKm < Infinity
    ? `${p.distanceKm < 1 ? Math.round(p.distanceKm * 1000) + " m" : p.distanceKm.toFixed(1) + " km"} away`
    : null;
  const mapsUrl = `https://www.google.com/maps?q=${p.lat},${p.lng}`;

  return `
    <div>
      <strong style="font-size:14px;color:#242424">${p.name ?? "Playground"}</strong>
      <br/><span>${typeLabel}</span>
      ${distLabel ? `<br/><span>${distLabel}</span>` : ""}
      <br/><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#C56850">Open in Maps →</a>
    </div>
  `;
}

function makePlaygroundPopupHtml(group: Playground[]): string {
  const items = group
    .map(makePlaygroundPopupItemHtml)
    .join(`<hr style="margin:8px 0;border:none;border-top:1px solid #eee" />`);

  return `
    <div style="font-size:13px;line-height:1.6;min-width:160px;max-width:240px;max-height:220px;overflow-y:auto;color:#8B7B72">
      ${group.length > 1 ? `<div style="font-size:11px;font-weight:700;color:#C56850;margin-bottom:6px;">${group.length} playgrounds here</div>` : ""}
      ${items}
    </div>
  `;
}

export default function ActivitiesMap({ activities, center, memberCoords, playgrounds = [] }: Props) {
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

      // Fit bounds to activity + playground markers; fall back to member coords
      const allCoords = [
        ...activities
          .filter((a) => a.lat != null && a.lng != null)
          .map((a) => [a.lat!, a.lng!] as [number, number]),
        ...playgrounds.map((p) => [p.lat, p.lng] as [number, number]),
      ];
      const boundsCoords = allCoords.length > 0
        ? allCoords
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

      // Locations first, events on top
      const sorted = [...activities].sort((a, b) =>
        (a.kind === "location" ? 0 : 1) - (b.kind === "location" ? 0 : 1),
      );

      for (const group of groupByCoord(sorted)) {
        const bg = group[0].kind === "location" ? COLORS.location : COLORS.activity;
        const icon = L.divIcon({
          className: "",
          html: makeGroupedMarkerHtml(bg, group.length),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([group[0].lat!, group[0].lng!], { icon })
          .bindPopup(makePopupHtml(group), { maxWidth: 260 })
          .addTo(map);
      }

      // Playground markers (rendered below activity markers)
      for (const group of groupByCoord(playgrounds)) {
        const icon = L.divIcon({
          className: "",
          html: makeGroupedMarkerHtml(COLORS.playground, group.length),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([group[0].lat, group[0].lng], { icon })
          .bindPopup(makePlaygroundPopupHtml(group), { maxWidth: 260 })
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
