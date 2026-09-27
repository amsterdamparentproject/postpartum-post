import type { createAdminClient } from "@/lib/supabase";
import { PARTNER_IMAGE_BUCKET, PARTNER_IMAGE_TYPES } from "@/lib/partner-image";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Server side of the partner photo upload, shared by the partner portal
 * (app/actions/partners.ts) and /admin/partners (app/admin/partners/actions.ts).
 * Callers resolve partnerId themselves — requirePartner() for partners,
 * the admin's explicit pick for admin.
 *
 * Why signed upload URLs: server actions cap request bodies at 1 MB by
 * default, and a phone photo is bigger. The browser gets a one-time signed
 * URL for a path under the partner's own folder, uploads straight to
 * Supabase Storage, then calls commitPartnerImage with that path.
 */

export type ImageUploadTicket =
  | { success: true; path: string; token: string }
  | { success: false; error: string };

export async function createPartnerImageUploadFor(
  supabase: SupabaseClient,
  partnerId: string,
  contentType: string,
): Promise<ImageUploadTicket> {
  const ext = PARTNER_IMAGE_TYPES[contentType];
  if (!ext) return { success: false, error: "Use a JPG, PNG, or WebP image" };

  const path = `${partnerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(PARTNER_IMAGE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[createPartnerImageUpload] signed URL error:", error?.message);
    return { success: false, error: "Couldn't start the upload — try again" };
  }
  return { success: true, path: data.path, token: data.token };
}

/** The bucket path inside one of our own public URLs, or null for any other URL. */
export function bucketPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PARTNER_IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/**
 * Points partners.image_url at an uploaded file (or clears it when path is
 * null), then deletes the previous file if it was one of ours. An image_url
 * that points anywhere else (pasted before uploads existed) is never
 * deleted — only unlinked.
 */
export async function commitPartnerImage(
  supabase: SupabaseClient,
  partnerId: string,
  path: string | null,
): Promise<{ success: true; imageUrl: string | null } | { success: false; error: string }> {
  if (path !== null && (!path.startsWith(`${partnerId}/`) || path.includes(".."))) {
    return { success: false, error: "Image not found" };
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("image_url")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return { success: false, error: "Partner not found" };

  const imageUrl = path ? supabase.storage.from(PARTNER_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl : null;

  const { error } = await supabase.from("partners").update({ image_url: imageUrl }).eq("id", partnerId);
  if (error) {
    console.error("[commitPartnerImage] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  const previousPath = bucketPathFromUrl(partner.image_url as string | null);
  if (previousPath && previousPath !== path) {
    const { error: removeError } = await supabase.storage.from(PARTNER_IMAGE_BUCKET).remove([previousPath]);
    if (removeError) console.error("[commitPartnerImage] remove old image error:", removeError.message);
  }

  return { success: true, imageUrl };
}
