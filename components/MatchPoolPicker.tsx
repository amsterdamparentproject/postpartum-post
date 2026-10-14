"use client";

/**
 * "Choose your match pool" radios for members with a cohort: just the cohort's
 * members, or anyone. Shared by /profile (inside the preferences autosave) and
 * the /matches side panel.
 */
export default function MatchPoolPicker({
  cohortName,
  cohortOnly,
  onChange,
  name = "matchPool",
}: {
  cohortName: string;
  cohortOnly: boolean;
  onChange: (cohortOnly: boolean) => void;
  name?: string;
}) {
  const option = "flex items-center gap-2 text-sm text-dark";
  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium text-dark mb-1">Choose your match pool</legend>
      <label className={`${option} cursor-pointer`}>
        <input
          type="radio"
          name={name}
          checked={cohortOnly}
          onChange={() => onChange(true)}
          className="accent-coral"
        />
        Just {cohortName} members
      </label>
      <label className={`${option} cursor-pointer`}>
        <input
          type="radio"
          name={name}
          checked={!cohortOnly}
          onChange={() => onChange(false)}
          className="accent-coral"
        />
        Anyone
      </label>
    </fieldset>
  );
}
