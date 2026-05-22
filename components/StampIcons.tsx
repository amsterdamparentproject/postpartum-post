/**
 * StampIcons
 *
 * Shared stamp SVG components used in PersonaCards and elsewhere.
 * Each icon renders inside a postage-stamp frame with perforated edges.
 */

import React from "react";

export function StampSVG({ fill, stroke, children }: {
  fill: string;
  stroke: string;
  children: React.ReactNode;
}) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" fill="none">
      {/* Stamp background */}
      <rect x="4" y="4" width="56" height="56" fill={fill} rx="2" />
      {/* Perforated border: round dots via dasharray */}
      <rect
        x="4" y="4" width="56" height="56"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeDasharray="0.1 7.2"
        strokeLinecap="round"
        rx="2"
      />
      {/* Inner stamp frame */}
      <rect x="10" y="10" width="44" height="44" fill="none" stroke={stroke} strokeWidth="0.8" rx="1" opacity="0.35" />
      {/* Icon artwork centred inside the stamp */}
      <g transform="translate(14 14) scale(0.75)">
        {children}
      </g>
    </svg>
  );
}

export function EnvelopeStamp({ fill = "rgba(197, 104, 80, 0.08)", stroke = "#C56850" }: {
  fill?: string;
  stroke?: string;
}) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <rect x="4" y="14" width="40" height="26" rx="3" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <polyline points="4,14 24,28 44,14" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z" fill={stroke} />
    </StampSVG>
  );
}
