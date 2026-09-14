import type { Metadata } from "next";
import PartnersLayoutClient from "@/app/partners/PartnersLayoutClient";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Sign in to manage your business info, locations, and perks — or express interest in becoming a Post Perks partner.",
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return <PartnersLayoutClient>{children}</PartnersLayoutClient>;
}
