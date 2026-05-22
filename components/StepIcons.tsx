import styles from "./StepIcons.module.css";

export function SubscribeIcon() {
  return (
    <svg viewBox="0 0 56 44" width="64" height="50" aria-hidden="true" className={styles.subscribeIcon}>
      <rect x="4" y="14" width="48" height="28" rx="2" fill="#C56850" />
      <polyline points="4,14 28,30 52,14" fill="none" stroke="#7D6048" strokeWidth="1.5" />
      <line x1="4" y1="42" x2="20" y2="28" stroke="#7D6048" strokeWidth="1" />
      <line x1="52" y1="42" x2="36" y2="28" stroke="#7D6048" strokeWidth="1" />
      <path
        d="M16,28 L24,36 L40,20"
        fill="none"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.checkPath}
      />
    </svg>
  );
}

export function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 64 66" width="64" height="66" aria-hidden="true" className={styles.chatIcon}>
      {/* Left bubble — single path with tail at bottom-left */}
      <g className={styles.leftBubble}>
        <path
          d="M7,4 L35,4 A5,5 0 0 1 40,9 L40,19 A5,5 0 0 1 35,24 L12,24 L3,32 L9,24 L7,24 A5,5 0 0 1 2,19 L2,9 A5,5 0 0 1 7,4 Z"
          fill="#C56850"
        />
        <rect x="8" y="10" width="22" height="2.5" rx="1.25" fill="white" opacity="0.9" />
        <rect x="8" y="16" width="15" height="2.5" rx="1.25" fill="white" opacity="0.9" />
      </g>
      {/* Right bubble — single path with tail at bottom-right */}
      <g className={styles.rightBubble}>
        <path
          d="M29,36 L57,36 A5,5 0 0 1 62,41 L62,51 A5,5 0 0 1 57,56 L52,56 L59,64 L43,56 L29,56 A5,5 0 0 1 24,51 L24,41 A5,5 0 0 1 29,36 Z"
          fill="#F4EDE6"
          stroke="#C56850"
          strokeWidth="1"
        />
        <rect x="30" y="42" width="24" height="2.5" rx="1.25" fill="#C56850" opacity="0.7" />
        <rect x="30" y="48" width="16" height="2.5" rx="1.25" fill="#C56850" opacity="0.7" />
      </g>
    </svg>
  );
}

export function LetterHeartIcon() {
  return (
    <svg viewBox="0 0 56 54" width="64" height="62" aria-hidden="true" className={styles.letterIcon}>
      <rect x="4" y="20" width="48" height="30" rx="2" fill="#C56850" />
      <line x1="4" y1="50" x2="22" y2="34" stroke="#7D6048" strokeWidth="1.5" />
      <line x1="52" y1="50" x2="34" y2="34" stroke="#7D6048" strokeWidth="1.5" />
      <path
        d="M4,20 L28,36 L52,20 Z"
        fill="#B05040"
        className={styles.flapPath}
      />
      <path
        d="M28,34 C28,30 22,28 22,32 C22,36 28,40 28,40 C28,40 34,36 34,32 C34,28 28,30 28,34 Z"
        fill="#F4EDE6"
        className={styles.heartPath}
      />
    </svg>
  );
}
