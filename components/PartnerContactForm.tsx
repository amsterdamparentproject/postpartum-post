"use client";

import { useState } from "react";
import { savePartnerContact, type PartnerProfile } from "@/app/actions/partners";
import { useAutosave } from "@/lib/use-autosave";
import { useRequiredField } from "@/lib/use-required-field";
import AutosaveStatus from "@/components/AutosaveStatus";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";
const disabledInputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-cream text-muted cursor-not-allowed";
const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * "Your info" — first_name/last_name/email on postpartumpost.partners.
 *
 * first/last name autosave (see lib/use-autosave.ts), same as the rest of
 * the partner profile. Email is read-only here — it's also the sign-in
 * identity (requirePartner resolves it by matching the verified session's
 * email straight against partners.email — see lib/require-partner.ts), and
 * there's no separate Supabase-Auth-user record to keep in sync, so a
 * self-service edit (typo'd or not) risks locking a partner out of their
 * own login with no recovery path. Changes go through Alex instead.
 *
 * Doesn't call a parent refresh() after saving. PartnerContext refetches
 * getPartnerProfile() using the same accessToken, which would be redundant
 * here (email can't change) but is also the reason it never made sense to
 * wire up: a refetch triggered by a save that HAD changed partners.email
 * would find no matching row (the JWT's email wouldn't match anymore) and
 * sign the partner out mid-edit.
 */
export default function PartnerContactForm({
  partner,
  accessToken,
}: {
  partner: Pick<PartnerProfile, "first_name" | "last_name" | "email">;
  accessToken: string;
}) {
  const [firstName, setFirstName] = useState(partner.first_name);
  const [lastName, setLastName] = useState(partner.last_name);

  const firstNameField = useRequiredField("First name");
  const lastNameField = useRequiredField("Last name");

  const { status, error } = useAutosave(
    { firstName, lastName },
    (v) =>
      savePartnerContact(accessToken, {
        first_name: v.firstName,
        last_name: v.lastName,
        email: partner.email,
      }),
    { skip: (v) => !v.firstName.trim() || !v.lastName.trim() },
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-dark">Your info</h2>
        <AutosaveStatus status={status} error={error} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>
            First name <RequiredMark />
          </label>
          <input
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); firstNameField.clear(); }}
            onBlur={() => firstNameField.onBlur(firstName)}
            required
            className={`${inputClass} ${firstNameField.error ? "border-coral" : ""}`}
          />
          {firstNameField.error && <p className="mt-1 text-xs text-coral">{firstNameField.error}</p>}
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); lastNameField.clear(); }}
            onBlur={() => lastNameField.onBlur(lastName)}
            required
            className={`${inputClass} ${lastNameField.error ? "border-coral" : ""}`}
          />
          {lastNameField.error && <p className="mt-1 text-xs text-coral">{lastNameField.error}</p>}
        </div>
      </div>
      <div>
        <label className={labelClass}>
          Email <RequiredMark />
        </label>
        <input type="email" value={partner.email} disabled readOnly className={disabledInputClass} />
        <p className="mt-1 text-xs text-muted">
          If you need to change your contact email, please contact us at{" "}
          <a href="mailto:post@amsterdamparentproject.nl" className="text-coral hover:text-coral-dark underline">
            post@amsterdamparentproject.nl
          </a>.
        </p>
      </div>
    </div>
  );
}
