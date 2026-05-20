import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
    "Postpartum Post matches parents in Amsterdam with each other — by neighborhood, by availability, by vibe. Subscribe and receive your first introduction this month.",
  openGraph: {
    type: "website",
    locale: "en_NL",
    siteName: "Postpartum Post",
    title: "Postpartum Post — meet a parent nearby",
    description:
      "A monthly matchmaking letter for parents in Amsterdam. Subscribe and we'll introduce you to someone nearby.",
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
    title: "Postpartum Post — meet a new parent nearby",
    description:
      "A monthly matchmaking letter for new parents in Amsterdam. Subscribe and we'll introduce you to someone nearby.",
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
    <html lang="en" className={`${playfair.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased font-[var(--font-sans)]">{children}</body>
    </html>
  );
}
