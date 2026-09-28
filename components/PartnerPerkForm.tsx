"use client";

import { useState, useTransition } from "react";
import {
  createPartnerImageUpload,
  savePartnerPerk,
  setPartnerImage,
  type PartnerPerk,
  type PartnerLocation,
} from "@/app/actions/partners";
import PhotoUpload from "@/components/PhotoUpload";
import PerkFields from "@/components/PerkFields";
import { defaultLocationIds, emptyPerkInput, perkToInput, type PerkInput } from "@/lib/perk-input";

/**
 * Create/edit form for a single perk. Always submits through
 * savePartnerPerk, which forces source: 'partner_portal' and status:
 * 'pending' server-side — a partner can never publish directly, and
 * editing a live perk sends it back to Alex's review queue (intentional,
 * see that action's docblock). The fields themselves are PerkFields,
 * shared with the admin forms.
 *
 * The photo is the partner's one image (partners.image_url), also on the
 * profile tab — repeated here because partners were missing it there. It
 * saves immediately, independent of "Submit for review".
 */
export default function PartnerPerkForm({
  perk,
  locations,
  website,
  imageUrl: initialImageUrl,
  onImageChange,
  accessToken,
  onSaved,
  onCancel,
}: {
  perk: PartnerPerk | null; // null = creating a new perk
  locations: PartnerLocation[];
  website: string | null; // partners.url — prefills the link
  imageUrl: string | null; // partners.image_url — shared by all of this partner's perks
  onImageChange: () => void; // refresh the partner (the photo saves on its own, immediately)
  accessToken: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<PerkInput>(() => {
    const initial = perk ? perkToInput(perk) : { ...emptyPerkInput(), location_ids: defaultLocationIds(locations) };
    return { ...initial, url: initial.url || website || "" };
  });
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await savePartnerPerk(accessToken, { ...value, id: perk?.id });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
        {perk ? "Edit perk" : "Add new perk"}
      </h2>

      <PerkFields
        value={value}
        onChange={setValue}
        locations={locations}
        photo={
          <PhotoUpload
            imageUrl={imageUrl}
            createUpload={(contentType) => createPartnerImageUpload(accessToken, contentType)}
            commit={(path) => setPartnerImage(accessToken, path)}
            onChange={(next) => {
              setImageUrl(next);
              onImageChange();
            }}
            label="Photo"
            hint="All of your perks share the same image. Updating the image here applies to all of your perks."
          />
        }
      />

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : perk ? "Save changes" : "Submit for review"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}
