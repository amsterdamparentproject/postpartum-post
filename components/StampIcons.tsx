/**
 * StampIcons
 *
 * Shared stamp SVG components used in PersonaCards and elsewhere.
 * Each icon renders inside a postage-stamp frame with perforated edges.
 */

import React from "react";

export function StampSVG({ fill, stroke, children, size = 64, background = "#F4EDE6" }: {
  fill: string;
  stroke: string;
  children: React.ReactNode;
  size?: number;
  background?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" fill="none">
      {/* Stamp background */}
      <rect x="4" y="4" width="56" height="56" fill={fill} rx="2" />
      {/* Perforated border: round dots via dasharray — color should match page background */}
      <rect
        x="4" y="4" width="56" height="56"
        fill="none"
        stroke={background}
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

export function EnvelopeStamp({ fill = "rgba(197, 104, 80, 0.08)", stroke = "#C56850", size = 64, background }: {
  fill?: string;
  stroke?: string;
  size?: number;
  background?: string;
}) {
  return (
    <StampSVG fill={fill} stroke={stroke} size={size} background={background}>
      <rect x="4" y="14" width="40" height="26" rx="3" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <polyline points="4,14 24,28 44,14" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z" fill={stroke} />
    </StampSVG>
  );
}

/** Green by default — same palette token as PersonaCards' first color slot (#8A9E3A / rgba(212, 224, 155, ...)). */
export function GiftStamp({ fill = "rgba(212, 224, 155, 0.18)", stroke = "#8A9E3A", size = 64, background }: {
  fill?: string;
  stroke?: string;
  size?: number;
  background?: string;
}) {
  return (
    <StampSVG fill={fill} stroke={stroke} size={size} background={background}>
      {/* Box */}
      <rect x="8" y="20" width="32" height="22" rx="2" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      {/* Lid */}
      <rect x="5" y="15" width="38" height="7" rx="1.5" fill={stroke} opacity="0.25" stroke={stroke} strokeWidth="1.2" />
      {/* Ribbon */}
      <rect x="21" y="15" width="6" height="27" fill={stroke} opacity="0.5" />
      {/* Bow */}
      <path d="M24 15 C20 6 10 7 13 13 C15 17 21 16.5 24 15 Z" fill={stroke} opacity="0.6" stroke={stroke} strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M24 15 C28 6 38 7 35 13 C33 17 27 16.5 24 15 Z" fill={stroke} opacity="0.6" stroke={stroke} strokeWidth="0.8" strokeLinejoin="round" />
      <circle cx="24" cy="15" r="2.2" fill={stroke} />
    </StampSVG>
  );
}

/**
 * Coral by default — matches the base palette of /perks' suggestion card
 * (PerkIdeaForm), which is where this replaces the plain 🗺️ emoji. The
 * center circle is punched through to `background` (default: the page's
 * cream) rather than filled, like a real map-pin's window — pass
 * background="white" when placing it on a white card, same convention as
 * every other StampIcons usage.
 */
export function LocationStamp({ fill = "rgba(197, 104, 80, 0.08)", stroke = "#C56850", size = 64, background = "#F4EDE6" }: {
  fill?: string;
  stroke?: string;
  size?: number;
  background?: string;
}) {
  return (
    <StampSVG fill={fill} stroke={stroke} size={size} background={background}>
      {/* Pin body — narrower and taller than a balloon, with a longer
          tapering tail, so it reads clearly as a map pin rather than a
          plain teardrop/circle. */}
      <path
        d="M24 4 C16 4 9.5 10.5 9.5 18.5 C9.5 29.5 24 45 24 45 C24 45 38.5 29.5 38.5 18.5 C38.5 10.5 32 4 24 4 Z"
        fill={stroke}
        opacity="0.18"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Center window, punched through to the surface behind the stamp */}
      <circle cx="24" cy="17.5" r="6.75" fill={background} stroke={stroke} strokeWidth="1.2" />
    </StampSVG>
  );
}
