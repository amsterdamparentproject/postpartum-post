"use server";

import { createAdminClient } from "@/lib/supabase";
import { sendWaitlistConfirmationEmail } from "@/lib/emails";

export async function joinWaitlist(email: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("waitlist")
    .insert({ email });

  if (error) {
    // Unique constraint violation — already on the list, still send success
    // but skip the email (they've already received one)
    if (error.code === "23505") return { success: true };
    console.error("[waitlist] Supabase error:", error);
    return { success: false, error: "Something went wrong — please try again." };
  }

  try {
    await sendWaitlistConfirmationEmail(email);
  } catch (e) {
    // Don't fail the signup if the email bounces — they're on the list
    console.error("[waitlist] Failed to send confirmation email:", e);
  }

  return { success: true };
}
