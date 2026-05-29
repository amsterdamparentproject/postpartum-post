import type { Metadata } from "next";
import { Nunito_Sans, DM_Sans, Solway } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const solway = Solway({
  subsets: ["latin"],
  weight: "400",
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
    "Sometimes you don't need a parent group. You just need one person who gets it. Postpartum Post introduces you to a new parent in your Amsterdam neighborhood, every month.",
  openGraph: {
    type: "website",
    locale: "en_NL",
    siteName: "Postpartum Post",
    title: "Postpartum Post — meet a parent nearby",
    description:
      "Sometimes you don't need a parent group. You just need one person who gets it. Postpartum Post introduces you to a new parent in your Amsterdam neighborhood, every month.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Postpartum Post — meet a parent nearby",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Postpartum Post — meet a parent nearby",
    description:
      "Sometimes you don't need a parent group. You just need one person who gets it. Postpartum Post introduces you to a new parent in your Amsterdam neighborhood, every month.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
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
