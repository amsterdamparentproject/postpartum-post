"use client";

import styles from "./AnimatedThankYou.module.css";

/**
 * The "card slides out of the envelope" thank-you animation for a form's
 * success state — drawn in EnvelopeLogo's language rather than as a stock
 * GIF: the same cream (#fffbf1) paper, the same hand-traced coral (#d26149)
 * line weight, and the same slight off-axis tilt.
 *
 * The heart stack on the envelope front is EnvelopeLogo's nested
 * bead/heart/bead/heart mark copied verbatim, placed by its true bounding
 * box (287.47,134.09)–(672.08,499.76) → center (479.775, 316.925). Position
 * it by that center, never by eye: the mark is the brand's differentiator
 * and its internal spacing has to stay exactly as the logo draws it. At
 * scale 0.273 it renders the same size relative to the envelope as it does
 * in EnvelopeLogo itself.
 *
 * Geometry notes, since the layer order is what makes the trick work:
 *   - back flap, then the card, then the envelope's FRONT panel on top, so
 *     the card genuinely emerges from inside the envelope;
 *   - the front panel's peak sits at y=164 and its shoulders at y=240, which
 *     is why the card parks at translateY(185px) — far enough down that none
 *     of its corners clear the sloping edge;
 *   - the card group is clipped to the envelope's bottom edge (y=316) so the
 *     parked card can't hang out below the envelope.
 *
 * The three sparkles are /sparkle.svg — the same asset Sparkle.tsx and the
 * Post Perks divider use, referenced rather than re-drawn so it can't drift
 * — and they twinkle in and stay, matching AnimatedSparkleDivider's
 * wiggle-once-then-rest behavior.
 *
 * Plays once and rests on the composed "Thank you" (see the module CSS);
 * it deliberately doesn't loop, because it sits next to copy people are
 * meant to read. Honors prefers-reduced-motion.
 */
export default function AnimatedThankYou({
  width = 240,
  className,
}: {
  width?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 340"
      width={width}
      height={width * (340 / 400)}
      className={`${styles.svg}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label="A thank-you card sliding out of an envelope"
    >
      <defs>
        <clipPath id="pp-thankyou-clip">
          <rect x="40" y="-60" width="320" height="376" />
        </clipPath>
      </defs>

      <g className={styles.stage}>
        {/* Soft purple halo, standing in for the ecard's pale disc */}
        <circle cx="200" cy="172" r="150" fill="#CAADFF" opacity="0.22" />

        {/* Open back flap */}
        <polygon
          points="62,168 200,44 338,168"
          fill="#fffbf1"
          stroke="#d26149"
          strokeWidth={5}
          strokeLinejoin="round"
        />

        {/* Envelope body (the part visible either side of the card) */}
        <rect
          x="62"
          y="166"
          width="276"
          height="150"
          rx="12"
          fill="#fffbf1"
          stroke="#d26149"
          strokeWidth={5}
        />

        {/* The card itself */}
        <g clipPath="url(#pp-thankyou-clip)">
          <g className={styles.card}>
            <g transform="rotate(-2.5 200 147)">
              <rect
                x="118"
                y="36"
                width="164"
                height="222"
                rx="9"
                fill="#fffbf1"
                stroke="#d26149"
                strokeWidth={4.5}
              />
              <text
                x="200"
                y="100"
                textAnchor="middle"
                fill="#d26149"
                fontSize="36"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Thank
              </text>
              <text
                x="200"
                y="142"
                textAnchor="middle"
                fill="#d26149"
                fontSize="36"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                you
              </text>
            </g>
          </g>
        </g>

        {/* Envelope front panel — drawn last of the envelope parts so the
            card slides up from behind it */}
        <path
          d="M62,240 L200,164 L338,240 L338,304 A12,12 0 0,1 326,316 L74,316 A12,12 0 0,1 62,304 Z"
          fill="#fffbf1"
          stroke="#d26149"
          strokeWidth={5}
          strokeLinejoin="round"
        />

        {/* EnvelopeLogo's heart mark, verbatim, centered on the front panel */}
        <g className={styles.beat}>
          <g transform="translate(200,240) scale(0.273) translate(-479.775,-316.925)">
            <ellipse fill="#b297ff" cx="472.05" cy="168.54" rx="35.95" ry="34.45" />
            <path fill="#fffbf1" d="M477.61,246.85c40.36-56.78,96.09-45.97,109.65-42.95,40.82,9.1,66.19,39.1,74.04,71.09,16.11,65.64-65.05,105.18-170.03,213.27h0c-118.07-94.88-202.15-124.57-194.6-191.62,3.68-32.67,25-65.44,64.34-79.29,13.07-4.6,69.26-22.09,116.61,29.5h0Z" />
            <path fill="#d26149" d="M492,499.75l-6.34-5.09c-33.88-27.22-64.72-48.89-91.94-68.01-67.22-47.23-111.63-78.42-105.72-130.9,4.45-39.55,31.28-72.59,70-86.22,20.9-7.37,72.75-18.93,118.78,24.35,28.3-33.98,68.73-47.83,112.45-38.1,40.18,8.96,71.04,38.58,80.55,77.31,12.53,51.07-27.5,86.99-88.09,141.38-25.04,22.48-53.42,47.95-84.05,79.49l-5.63,5.8ZM398.97,219.17c-14.86,0-27.34,3.34-34.96,6.02-38.8,13.66-55.76,46.33-58.69,72.35-4.83,42.9,34.14,70.28,98.7,115.64,25.74,18.08,54.69,38.42,86.5,63.63,28.87-29.31,55.55-53.26,79.26-74.54,58.16-52.2,93.26-83.71,83.03-125.37-6.25-25.48-27.28-55.9-67.53-64.87-23.33-5.2-67.43-6.98-100.47,39.52l-6.32,8.89-7.42-8.08c-24.03-26.18-50.57-33.2-72.11-33.2Z" />
            <ellipse fill="#b297ff" cx="479.66" cy="296.19" rx="21.14" ry="20.26" />
            <path fill="#fffbf1" d="M484.37,347.84c22.98-32.33,54.71-26.18,62.43-24.45,23.24,5.18,37.69,22.26,42.15,40.47,9.17,37.37-37.03,59.88-96.81,121.42h0c-67.22-54.02-115.09-70.92-110.79-109.1,2.09-18.6,14.23-37.26,36.63-45.14,7.44-2.62,39.43-12.58,66.39,16.79h0Z" />
            <path fill="#d26149" d="M492.88,496.77l-6.34-5.09c-19.19-15.42-36.7-27.72-52.15-38.58-39.32-27.62-65.3-45.87-61.7-77.81,2.69-23.89,18.89-43.84,42.29-52.08,12.16-4.27,41.67-10.91,68.59,12.02,16.88-18.31,40.13-25.55,65.21-19.97,24.26,5.41,42.91,23.3,48.65,46.69,7.63,31.1-15.79,52.12-51.24,83.94-14.21,12.76-30.32,27.22-47.67,45.08l-5.63,5.8ZM439.76,335.57c-7.43,0-13.97,1.62-18.77,3.31-20.48,7.21-29.42,24.46-30.97,38.2-2.42,21.46,15.02,34.69,54.68,62.55,13.97,9.81,29.59,20.79,46.72,34.22,15.59-15.66,30-28.59,42.88-40.15,34.79-31.23,51.29-47.16,46.19-67.93-3.3-13.46-14.4-29.52-35.64-34.25-12.34-2.76-35.69-3.7-53.25,21.02l-6.32,8.89-7.42-8.08c-12.69-13.82-26.47-17.78-38.08-17.78Z" />
          </g>
        </g>

        {/* Post Perks sparkles twinkling in around the envelope */}
        <g className={styles.sparkle1}>
          <image href="/sparkle.svg" x="-27" y="-27" width="54" height="54" />
        </g>
        <g className={styles.sparkle2}>
          <image href="/sparkle.svg" x="-20" y="-20" width="40" height="40" />
        </g>
        <g className={styles.sparkle3}>
          <image href="/sparkle.svg" x="-16" y="-16" width="32" height="32" />
        </g>
      </g>
    </svg>
  );
}
