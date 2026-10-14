"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AnimatedMail.module.css";
import WordMark from "./WordMark";
import EnvelopeLogo from "./EnvelopeLogo";

export default function AnimatedMail() {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Trigger off the envelope itself, so it opens while it's on screen.
    // (It used to key off #alex-intro, which was right below it; the sample
    // match page and perks swiper now sit between the two, so the envelope
    // was long scrolled out of view by the time it opened.)
    const target = ref.current;
    if (!target) return;

    let openTimer: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(openTimer);
        if (entry.isIntersecting) {
          // Small delay so the user notices the envelope before it opens
          openTimer = setTimeout(() => setOpen(true), 300);
        } else {
          setOpen(false);
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
      clearTimeout(openTimer);
    };
  }, []);

  return (
    <div className={styles.wrapper} ref={ref}>
      <div className={`${styles.letterImage} ${open ? styles.open : ""}`}>
        <div className={styles.animatedMail}>
          <div className={styles.backFold} />
          <div className={styles.letter}>
            <div className={styles.letterBorder} />
            <p className={styles.letterTitle}>From: <WordMark size="text-2xs" /></p>
            <p className={styles.letterContext}>To: You &amp; your new parent friend</p>
            <div className={styles.letterStamp}>
              <EnvelopeLogo width={30} height={22} />
            </div>
          </div>
          <div className={styles.topFold} />
          <div className={styles.envelopeBody} />
          <div className={styles.leftFold} />
        </div>
        <div className={styles.shadow} />
      </div>
    </div>
  );
}
