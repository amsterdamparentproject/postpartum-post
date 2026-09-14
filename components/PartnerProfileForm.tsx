"use client";

import { useState } from "react";
import { savePartnerProfile, type PartnerProfile } from "@/app/actions/partners";
import { useAutosave } from "@/lib/use-autosave";
import { useRequiredField } from "@/lib/use-required-field";
import AutosaveStatus from "@/components/AutosaveStatus";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";
const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * Business-level fields on postpartumpost.partners (business_name/url/
 * description/image_url) — autosaves (see lib/use-autosave.ts) rather than
 * requiring an explicit Save click. business_name and url are required in
 * this form (url isn't NOT NULL at the DB level, but a save is still
 * skipped while either is empty mid-edit, same reasoning as business_name:
 * don't fire — and fail — on every keystroke of someone clearing a field
 * to retype it).
 *
 * The partner's own name/email live in PartnerContactForm ("Your info")
 * instead — kept separate because email edits need special handling
 * (see that component's docblock) that this form doesn't.
 */
export default function PartnerProfileForm({
  partner,
  accessToken,
  onSaved,
}: {
  partner: PartnerProfile;
  accessToken: string;
  onSaved: (updated: Pick<PartnerProfile, "business_name" | "url" | "description" | "image_url">) => void;
}) {
  const [businessName, setBusinessName] = useState(partner.business_name);
  const [url, setUrl] = useState(partner.url ?? "");
  const [description, setDescription] = useState(partner.description ?? "");
  const [imageUrl, setImageUrl] = useState(partner.image_url ?? "");

  const businessNameField = useRequiredField("Business name");
  const urlField = useRequiredField("Website");

  const { status, error } = useAutosave(
    { businessName, url, description, imageUrl },
    async (v) => {
      const result = await savePartnerProfile(accessToken, {
        business_name: v.businessName,
        url: v.url,
        description: v.description,
        image_url: v.imageUrl,
      });
      if (result.success) {
        onSaved({
          business_name: v.businessName.trim(),
          url: v.url.trim() || null,
          description: v.description.trim() || null,
          image_url: v.imageUrl.trim() || null,
        });
      }
      return result;
    },
    { skip: (v) => !v.businessName.trim() || !v.url.trim() },
  );

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-dark">Business info</h2>
        <AutosaveStatus status={status} error={error} />
      </div>
      <div>
        <label className={labelClass}>
          Business name <RequiredMark />
        </label>
        <input
          value={businessName}
          onChange={(e) => { setBusinessName(e.target.value); businessNameField.clear(); }}
          onBlur={() => businessNameField.onBlur(businessName)}
          required
          className={`${inputClass} ${businessNameField.error ? "border-coral" : ""}`}
        />
        {businessNameField.error && <p className="mt-1 text-xs text-coral">{businessNameField.error}</p>}
      </div>
      <div>
        <label className={labelClass}>
          Website <RequiredMark />
        </label>
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); urlField.clear(); }}
          onBlur={() => urlField.onBlur(url)}
          required
          className={`${inputClass} ${urlField.error ? "border-coral" : ""}`}
          placeholder="https://"
        />
        {urlField.error && <p className="mt-1 text-xs text-coral">{urlField.error}</p>}
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="What you offer, in a sentence or two"
        />
      </div>
      <div>
        <label className={labelClass}>Logo image URL</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputClass} placeholder="https://" />
      </div>
    </form>
  );
}
