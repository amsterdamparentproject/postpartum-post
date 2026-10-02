import type { Metadata } from "next";
import RematchLoader from "@/components/RematchLoader";

export const metadata: Metadata = {
  title: "Report a Problem",
  robots: { index: false },
};

export default function Rematch() {
  return <RematchLoader />;
}
