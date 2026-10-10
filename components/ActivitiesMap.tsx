"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { Activity, Playground } from "@/lib/activities";
import { formatPlaygroundType } from "@/lib/activities";
import { LISTING_COLORS, LISTING_KINDS, type ListingKind } from "@/lib/listing-kinds";

interface Props {
  activities: Activity[];
  center: { lat: number; lng: number } | null;
  /** Member coordinates used only for bounds fitting — no markers rendered */
  memberCoords: { lat: number; lng: number }[];
  playgrounds?: Playground[];
  perks?: MapPerk[];
  /** Homepage sample match: perk popups drop their "Redeem now" link. */
  preview?: boolean;
}

/** A live Post Perk with a geocoded location (see lib/public-perks.ts). */
export type MapPerk = {
  id: string;
  title: string;
  partnerName: string;
  locationLabel: string | null;
  description: string;
  imageUrl: string | null;
  exclusive: boolean;
  lat: number;
  lng: number;
};

const COLORS = {
  location: LISTING_COLORS.place,
  activity: LISTING_COLORS.event,
  playground: LISTING_COLORS.playground,
  perk: LISTING_COLORS.perk,
};

const PERK_MARKER_SIZE = 36;

/**
 * Perk markers stand out from the plain dots: bigger, darker Post Perks
 * green, a white ring, a stronger shadow, and the Post Perks sparkle drawn
 * white (the SVG is light green; brightness(0) invert(1) turns it white).
 * Several perks at one spot get a small count badge instead of a number in
 * the middle, so the sparkle stays visible.
 */
function makePerkMarkerHtml(count: number): string {
  const badge = count > 1
    ? `<div style="
        position: absolute; top: -4px; right: -4px;
        min-width: 16px; height: 16px; padding: 0 4px;
        background: white; color: ${COLORS.perk};
        border-radius: 8px; font-size: 10px; font-weight: 700; line-height: 16px;
        text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.25);
      ">${count}</div>`
    : "";
  return `<div style="
    position: relative;
    width: ${PERK_MARKER_SIZE}px; height: ${PERK_MARKER_SIZE}px;
    background: ${COLORS.perk};
    border-radius: 50%;
    border: 2.5px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
    box-sizing: border-box;
  ">
    <img src="/sparkle.svg" alt="" style="width: 20px; height: 20px; filter: brightness(0) invert(1);" />
    ${badge}
  </div>`;
}

/** Escape text before it goes into popup HTML (partner- and Desk-written). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Popups — one shared layout for every marker type, so they read as one
// system: a square on the left (partner photo for perks, the type's color +
// icon otherwise — that color is what says what kind of marker it is), a
// type chip only for perks (Exclusive/free perks still need calling out),
// the title, up to two lines of description (never an address), and one
// coral action. The "map-popup" class (app/globals.css) strips Leaflet's
// padding.
// ---------------------------------------------------------------------------

type PopupItem = {
  kind: ListingKind;
  title: string;
  line: string | null;
  imageUrl?: string | null;
  action: { label: string; href: string; external: boolean } | null;
};

function popupItemHtml(item: PopupItem): string {
  const kind = LISTING_KINDS[item.kind];
  const square = item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : kind.icon(26);
  const chip = item.kind === "perk"
    ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:0 6px;border-radius:999px;background:${kind.color};color:${kind.ink};font-size:10px;font-weight:700;line-height:15px">
         <img src="/sparkle.svg" alt="" style="width:9px;height:9px;filter:brightness(0) invert(1)" />${kind.label}
       </span>`
    : "";
  const action = item.action
    ? `<a href="${escapeHtml(item.action.href)}" ${item.action.external ? 'target="_blank" rel="noopener noreferrer"' : ""}
         style="margin-top:3px;color:#C56850;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap">${escapeHtml(item.action.label)} →</a>`
    : "";

  return `
    <div style="display:flex;gap:8px;padding:6px 22px 6px 6px;width:250px;box-sizing:border-box">
      <div style="width:56px;height:56px;flex-shrink:0;border-radius:7px;overflow:hidden;background:${kind.color};display:flex;align-items:center;justify-content:center">
        ${square}
      </div>
      <div style="min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;align-items:flex-start">
        ${chip}
        <div style="font-family:var(--font-serif);font-size:14px;line-height:1.25;color:#242424">${escapeHtml(item.title)}</div>
        ${item.line ? `<div style="max-width:100%;font-size:11px;line-height:1.4;color:#4a4a4a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(item.line)}</div>` : ""}
        ${action}
      </div>
    </div>
  `;
}

/** One popup; several items at the same spot stack and scroll. */
function popupHtml(items: PopupItem[]): string {
  const body = items.map(popupItemHtml).join(`<div style="height:1px;background:#eee"></div>`);
  return items.length === 1 ? body : `<div style="max-height:200px;overflow-y:auto">${body}</div>`;
}

const POPUP_OPTIONS = { maxWidth: 250, minWidth: 250, className: "map-popup" };

function perkItem(perk: MapPerk, preview = false): PopupItem {
  return {
    kind: "perk",
    title: perk.title,
    line: perk.description,
    imageUrl: perk.imageUrl,
    action: preview ? null : { label: "Redeem now", href: `/my-perks?perk=${encodeURIComponent(perk.id)}`, external: false },
  };
}

function activityItem(a: Activity): PopupItem {
  const description = (a.description ?? a.tagline ?? "").trim() || null;
  const date =
    a.kind === "event" && (a.repeat_next_date ?? a.start_date)
      ? new Date((a.repeat_next_date ?? a.start_date)!).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        })
      : null;
  return {
    kind: a.kind === "event" ? "event" : "place",
    title: a.title,
    line: [date, description].filter(Boolean).join(" · ") || null,
    action: a.url ? { label: "More info", href: a.url, external: true } : null,
  };
}

function playgroundItem(p: Playground): PopupItem {
  const distance = p.distanceKm < Infinity
    ? `${p.distanceKm < 1 ? Math.round(p.distanceKm * 1000) + "m" : p.distanceKm.toFixed(1) + "km"} from your halfway point`
    : null;
  return {
    kind: "playground",
    title: p.name ?? "Playground",
    line: [formatPlaygroundType(p.playground_type), distance].filter(Boolean).join(" · "),
    action: { label: "Open in Maps", href: `https://www.google.com/maps?q=${p.lat},${p.lng}`, external: true },
  };
}

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

export default function ActivitiesMap({ activities, center, memberCoords, playgrounds = [], perks = [], preview = false }: Props) {
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

      // Fit bounds to activity + playground markers; fall back to member coords.
      // Perks are left out on purpose: they can be anywhere in the city, and
      // zooming out to include them would lose the pair's neighborhood.
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

      // Strip Leaflet's default popup margins/padding for our card popups.
      // Done inline on open rather than only in app/globals.css (.map-popup),
      // because leaflet.css's own rules were still winning there — which is
      // what made the popups look so padded.
      map.on("popupopen", (e) => {
        const el = e.popup.getElement();
        if (!el?.classList.contains("map-popup")) return;
        const wrapper = el.querySelector<HTMLElement>(".leaflet-popup-content-wrapper");
        const content = el.querySelector<HTMLElement>(".leaflet-popup-content");
        if (wrapper) {
          wrapper.style.padding = "0";
          wrapper.style.overflow = "hidden";
          wrapper.style.borderRadius = "12px";
        }
        if (content) {
          content.style.margin = "0";
          content.style.width = "250px";
          content.style.lineHeight = "normal";
        }
        e.popup.update(); // re-measure so the tip and position match the new size
      });

      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
      L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${cartoKey ? `?key=${cartoKey}` : ""}`,
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
          popupAnchor: [0, -14],
        });
        L.marker([group[0].lat!, group[0].lng!], { icon })
          .bindPopup(popupHtml(group.map(activityItem)), POPUP_OPTIONS)
          .addTo(map);
      }

      // Playground markers (rendered below activity markers)
      for (const group of groupByCoord(playgrounds)) {
        const icon = L.divIcon({
          className: "",
          html: makeGroupedMarkerHtml(COLORS.playground, group.length),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        });
        L.marker([group[0].lat, group[0].lng], { icon })
          .bindPopup(popupHtml(group.map(playgroundItem)), POPUP_OPTIONS)
          .addTo(map);
      }

      // Perk markers — added last so they sit on top of everything else.
      for (const group of groupByCoord(perks)) {
        const icon = L.divIcon({
          className: "",
          html: makePerkMarkerHtml(group.length),
          iconSize: [PERK_MARKER_SIZE, PERK_MARKER_SIZE],
          iconAnchor: [PERK_MARKER_SIZE / 2, PERK_MARKER_SIZE / 2],
          popupAnchor: [0, -PERK_MARKER_SIZE / 2],
        });
        L.marker([group[0].lat, group[0].lng], { icon, zIndexOffset: 1000 })
          .bindPopup(popupHtml(group.map((g) => perkItem(g, preview))), POPUP_OPTIONS)
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
