"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { MemberLocation } from "@/app/admin/stats/actions";

interface Props {
  locations: MemberLocation[];
}

/**
 * Groups members sharing the exact same coordinates (very common here since
 * lat/lng are geocoded from zipcode, not street address — many members in
 * the same postal code land on the identical point) so they render as one
 * marker with a combined tooltip, instead of stacking invisibly.
 */
function groupByCoord(locations: MemberLocation[]): MemberLocation[][] {
  const map = new Map<string, MemberLocation[]>();
  for (const loc of locations) {
    const key = `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(loc);
  }
  return [...map.values()];
}

// Loaded dynamically to avoid SSR — Leaflet requires window
export default function MemberMap({ locations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;

      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [52.374, 4.89], // Amsterdam
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const makeDotIcon = (count: number) => L.divIcon({
        className: "",
        html: `<div style="
          width: ${count > 1 ? 18 : 10}px;
          height: ${count > 1 ? 18 : 10}px;
          background: #E8745A;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: white;
        ">${count > 1 ? count : ""}</div>`,
        iconSize: [count > 1 ? 18 : 10, count > 1 ? 18 : 10],
        iconAnchor: [count > 1 ? 9 : 5, count > 1 ? 9 : 5],
      });

      for (const group of groupByCoord(locations)) {
        const items = group.map(({ name, parentType, zipcode, childLabels, availabilityLabel }) => {
          const childLine = childLabels.length ? childLabels.join(", ") : "No children listed";
          return `
            <div>
              <strong>${name}</strong><br/>
              ${parentType}${zipcode ? ` · ${zipcode}` : ""}<br/>
              <span style="color:#666">${childLine}</span><br/>
              <span style="color:#666">${availabilityLabel}</span>
            </div>`;
        }).join(`<hr style="margin:6px 0;border:none;border-top:1px solid #eee" />`);

        const tooltipHtml = `
          <div style="font-size:13px;line-height:1.5;max-width:220px;max-height:220px;overflow-y:auto">
            ${group.length > 1 ? `<div style="font-size:11px;font-weight:700;color:#E8745A;margin-bottom:4px;">${group.length} members here</div>` : ""}
            ${items}
          </div>`;
        L.marker([group[0].lat, group[0].lng], { icon: makeDotIcon(group.length) })
          .bindTooltip(tooltipHtml, { direction: "top", offset: [0, -8] })
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
      style={{ width: "100%", height: "320px", borderRadius: "10px", overflow: "hidden" }}
    />
  );
}
