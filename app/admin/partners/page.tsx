import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import AdminNav from "@/app/admin/AdminNav";
import PartnersClient from "./PartnersClient";

export default async function AdminPartnersPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!verifyAdminSessionToken(session?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-[#f0f1f5] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <AdminNav active="partners" />
        <PartnersClient />
      </div>
    </main>
  );
}
