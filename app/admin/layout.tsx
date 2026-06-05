import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin: Postpartum Post",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
