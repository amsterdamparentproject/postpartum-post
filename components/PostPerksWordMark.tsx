export default function PostPerksWordMark({ size = "text-xl", className, plural = true }: { size?: string; className?: string; plural?: boolean }) {
  return (
    <span className={[size, "font-bold", className].filter(Boolean).join(" ")} style={{ fontFamily: "var(--font-serif)", color: "#8A9E3A" }}>
      post {plural ? "perks" : "perk"}
    </span>
  );
}
