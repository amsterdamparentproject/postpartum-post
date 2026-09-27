"use client";

import { useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { PARTNER_IMAGE_BUCKET, PARTNER_IMAGE_MAX_DIMENSION } from "@/lib/partner-image";
import type { ImageUploadTicket } from "@/lib/partner-image-save";

type CommitResult = { success: boolean; error?: string; imageUrl?: string | null };

/**
 * The partner photo field (partners.image_url) — used by PartnerProfileForm
 * (partner portal) and EditPartnerForm (/admin/partners), which pass their
 * own createUpload/commit actions. Flow: downscale in the browser -> ask
 * the server for a signed upload URL -> upload straight to Storage -> commit
 * the path. The file never goes through a server action (1 MB body limit).
 * Saves immediately; it doesn't wait for the surrounding form.
 */
export default function PhotoUpload({
  imageUrl,
  createUpload,
  commit,
  onChange,
  label = "Image to use for Post Perk cards",
  hint = "We use the same image across all of your perks. Wide photos work best!",
  labelClass = "block text-sm font-medium text-dark mb-1",
}: {
  imageUrl: string | null;
  createUpload: (contentType: string) => Promise<ImageUploadTicket>;
  commit: (path: string | null) => Promise<CommitResult>;
  onChange: (imageUrl: string | null) => void;
  label?: string;
  hint?: string;
  labelClass?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const blob = await downscale(file);
      const ticket = await createUpload(blob.type);
      if (!ticket.success) throw new Error(ticket.error);

      const { error: uploadError } = await createBrowserClient()
        .storage.from(PARTNER_IMAGE_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: blob.type });
      if (uploadError) throw new Error("Upload failed — try again");

      const result = await commit(ticket.path);
      if (!result.success) throw new Error(result.error ?? "Couldn't save — try again");
      onChange(result.imageUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — try again");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    const result = await commit(null);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't remove — try again");
      return;
    }
    onChange(null);
  }

  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}
      <p className="text-xs text-muted mb-2">{hint}</p>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- any host (older pasted URLs), small preview
        <img
          src={imageUrl}
          alt=""
          className="w-full aspect-[16/9] object-cover rounded-lg border border-border mb-2"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-border text-dark hover:border-coral/40 transition disabled:opacity-60"
        >
          {busy ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
        </button>
        {imageUrl && !busy && (
          <button type="button" onClick={handleRemove} className="text-sm text-muted hover:text-coral transition">
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}

/**
 * Scales the longest side down to PARTNER_IMAGE_MAX_DIMENSION and re-encodes
 * as WebP (JPEG where the browser can't encode WebP) — a 5 MB phone photo
 * becomes a few hundred KB. Images already small enough are still
 * re-encoded, which also strips EXIF (location) data.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PARTNER_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Couldn't read that image");
  return jpeg;
}
