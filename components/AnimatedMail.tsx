import styles from "./AnimatedMail.module.css";

export default function AnimatedMail() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.letterImage}>
        <div className={styles.animatedMail}>
          <div className={styles.backFold} />
          <div className={styles.letter}>
            <div className={styles.letterBorder} />
            <p className={styles.letterTitle}>From: Postpartum Post</p>
            <p className={styles.letterContext}>To: You &amp; your new parent friend</p>
            <div className={styles.letterStamp} />
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
