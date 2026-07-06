import Image from "next/image";
import { monthlyFeature } from "@/lib/monthly-feature";

/**
 * "Your monthly smidge of whimsy" — featured community art on the match page.
 * Renders nothing when lib/monthly-feature.ts has no feature configured.
 */
export default function MonthlyWhimsy() {
  if (!monthlyFeature) return null;

  const { imageSrc, imageAlt, title, author, authorAge, featuredMonth, description } = monthlyFeature;
  const monthLabel = new Date(featuredMonth + "-01").toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pt-4 pb-2">
      <h2
        className="text-2xl sm:text-3xl font-normal text-dark"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Your monthly smidge of whimsy
      </h2>
      <p className="my-3">
        Every month, we feature a young artist 👩‍🎨 from the community to bring a touch of
        childlike delight to the match process. Want to submit a piece of art? Follow{" "}
        <a
          href="https://instagram.com/amsterdamparentproject"
          target="_blank"
          rel="noopener noreferrer"
          className="text-coral hover:underline"
        >
          APP on Instagram
        </a>{" "}
        for our monthly artist call and a chance to win a free month to the Post!
      </p>

      <div
        className="p-4 space-y-3 bg-white"
        style={{
          borderRadius: "2rem 0.5rem 2rem 0.5rem / 0.5rem 2rem 0.5rem 2rem",
          border: "1.5px solid var(--coral)",
        }}
      >
        <div className="relative w-full aspect-[4/3] overflow-hidden rounded-xl bg-border/30">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 768px) 672px, 100vw"
            className="object-cover"
          />
        </div>
        <div>
          <p className="font-semibold text-dark" style={{ fontFamily: "var(--font-serif)" }}>
            {title}
          </p>
          <p className="text-muted text-sm">
            By {author}
            {authorAge != null && `, age ${authorAge} years`} ({monthLabel})
          </p>
        </div>
        {description && (
          <p className="text-dark text-sm leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
}
