/**
 * Partner photo constants — client-safe (PhotoUpload imports these).
 * The one partner image is partners.image_url: "A photo of your space (or
 * you)". Files live in the public `partner-images` bucket created by
 * db/migrations/027_simplify_perks.sql, at `{partnerId}/{uuid}.{ext}`.
 */

export const PARTNER_IMAGE_BUCKET = "partner-images";

export const PARTNER_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Longest side after the in-browser downscale, before upload. */
export const PARTNER_IMAGE_MAX_DIMENSION = 1600;
