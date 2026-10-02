import { redirect } from "next/navigation";

// The old public unsubscribe link took a bare member id with no login, so
// anyone holding an id could cancel that member. Cancelling now needs a
// signed-in session, so any old link lands on the billing page instead.
export default function Unsubscribe() {
  redirect("/billing");
}
