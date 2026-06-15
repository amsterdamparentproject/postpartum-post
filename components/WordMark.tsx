export default function WordMark({ size = "text-xl", className }: { size?: string; className?: string }) {
  return (
    <span className={[size, "font-bold", className].filter(Boolean).join(" ")} style={{ fontFamily: "var(--font-serif)" }}>
      <span className="text-coral">postpartum</span>{" "}
      <span className="text-dark">post</span>
    </span>
  );
}
