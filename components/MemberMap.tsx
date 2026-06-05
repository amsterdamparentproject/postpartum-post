"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MemberLocation } from "@/app/admin/stats/actions";

interface Props {
  locations: MemberLocation[];
}

// Loaded dynamically to avoid SSR — Leaflet requires window
export default function MemberMap({ locations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

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

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const dotIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 10px;
          height: 10px;
          background: #E8745A;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      for (const { lat, lng } of locations) {
        L.marker([lat, lng], { icon: dotIcon }).addTo(map);
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
