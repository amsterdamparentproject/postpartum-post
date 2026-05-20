import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/profile",
          "/billing",
          "/matches",
          "/success",
          "/rematch",
          "/unsubscribe",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
