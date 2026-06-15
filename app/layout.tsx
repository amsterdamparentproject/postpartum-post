import type { Metadata } from "next";
import { Nunito_Sans, DM_Sans, Solway } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const solway = Solway({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans-dm",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com"
  ),
  title: {
    default: "Postpartum Post",
    template: "%s · Postpartum Post",
  },
  description:
    "Friendship starter packs for new and expecting Amsterdam parents: one curated match and a handpicked list of things to do with your families each month.",
  openGraph: {
    type: "website",
    locale: "en_NL",
    siteName: "Postpartum Post",
    title: "Postpartum Post",
    description:
      "Friendship starter packs for new and expecting Amsterdam parents: one curated match and a handpicked list of things to do with your families each month.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Postpartum Post",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Postpartum Post",
    description:
      "Friendship starter packs for new and expecting Amsterdam parents: one curated match and a handpicked list of things to do with your families each month.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/envelope.svg",
    apple: "/envelope.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${solway.variable} ${nunitoSans.variable} ${dmSans.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased font-[var(--font-sans)]">{children}</body>
      {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          strategy="afterInteractive"
        />
      )}
    </html>
  );
}
