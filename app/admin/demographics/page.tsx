import { redirect } from "next/navigation";

// Renamed to /admin/members; kept so old bookmarks still work.
export default function DemographicsRedirect() {
  redirect("/admin/members");
}
