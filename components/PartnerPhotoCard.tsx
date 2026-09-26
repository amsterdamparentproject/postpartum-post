"use client";

import { useState } from "react";
import {
  createPartnerImageUpload,
  setPartnerImage,
  type PartnerProfile,
} from "@/app/actions/partners";
import PhotoUpload from "@/components/PhotoUpload";

/**
 * The partner's photo (partners.image_url) as its own box on
 * /partners/profile — split out of "Business info" so it's harder to miss.
 * The same upload also sits in the perk form. Saves immediately; onSaved
 * refreshes the partner so perk previews pick up the new photo.
 */
export default function PartnerPhotoCard({
  partner,
  accessToken,
  onSaved,
}: {
  partner: PartnerProfile;
  accessToken: string;
  onSaved: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(partner.image_url);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-dark">Photo</h2>
      <PhotoUpload
        imageUrl={imageUrl}
        createUpload={(contentType) => createPartnerImageUpload(accessToken, contentType)}
        commit={(path) => setPartnerImage(accessToken, path)}
        onChange={(next) => {
          setImageUrl(next);
          onSaved();
        }}
        label=""
        hint="A photo to represent your business, such as a logo or hero image. It shows on all of your perk cards. Wide photos work best."
      />
    </div>
  );
}
