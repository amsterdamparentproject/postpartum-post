"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOnboardingSignInLink } from "@/app/actions/auth";
import { updateMemberProfile, updateOnboardingProfile, type MemberProfile, type Availability, type Child } from "@/app/actions/profile";
import { createBrowserClient } from "@/lib/supabase";
import { ENABLE_TIME_OF_DAY } from "@/lib/flags";
import { useAutosave } from "@/lib/use-autosave";
import { useRequiredField } from "@/lib/use-required-field";
import AutosaveStatus from "@/components/AutosaveStatus";
import RequiredMark from "@/components/RequiredMark";


const DUTCH_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;


const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "dutch", label: "Dutch" },
];

const DAYS = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

const TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const CHILD_YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR + 1 - i); // +1 for due dates
const CHILD_YEAR_BEFORE = CURRENT_YEAR - 10; // sentinel label: "Before [this year]"

const selectClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-10";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const disabledInputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-cream text-muted cursor-not-allowed";

const labelClass = "block text-sm font-medium text-dark mb-1";

function ChevronDown() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ToggleButton({
  selected, onClick, children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
        selected
          ? "bg-coral text-white border-coral"
          : "bg-white text-dark border-border hover:border-coral"
      }`}
    >
      {children}
    </button>
  );
}

function ChildRow({
  child,
  onChange,
  onRemove,
}: {
  child: Child;
  onChange: (updated: Child) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={child.expected ? "due" : "born"}
          onChange={(e) => onChange({ ...child, expected: e.target.value === "due" })}
          className="px-3 py-2 rounded-lg border border-border bg-white text-dark text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-7"
        >
          <option value="born">Born</option>
          <option value="due">Due</option>
        </select>
        <ChevronDown />
      </div>

      <div className="relative flex-1">
        <select
          value={child.birth_month}
          onChange={(e) => onChange({ ...child, birth_month: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-white text-dark text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-7"
        >
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
        <ChevronDown />
      </div>

      <div className="relative">
        <select
          value={child.birth_year}
          onChange={(e) => onChange({ ...child, birth_year: Number(e.target.value) })}
          className="px-3 py-2 rounded-lg border border-border bg-white text-dark text-sm focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-7"
        >
          {CHILD_YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value={CHILD_YEAR_BEFORE - 1}>Before {CHILD_YEAR_BEFORE}</option>
        </select>
        <ChevronDown />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="text-muted hover:text-coral transition text-lg leading-none px-1"
        aria-label="Remove child"
      >
        ✕
      </button>
    </div>
  );
}

type Props = {
  initialData: Partial<MemberProfile>;

  mode: "onboarding" | "profile";
  section?: "personal" | "details" | "preferences";
  /** Stripe Checkout Session id (onboarding only). Used to mint the
   *  post-checkout sign-in link against a verified session rather than a
   *  client-supplied email — see app/actions/auth.ts (audit S1 PP twin). */
  sessionId?: string;
};

const SECTION_TITLES: Record<string, string> = {
  personal: "Personal info",
  details: "Details",
  preferences: "Preferences",
};

/**
 * Reads the current Supabase session's access token for an authenticated
 * (mode: "profile") save — never a client-supplied member id (audit
 * Finding 1). Returns null if the session has lapsed; callers surface that
 * as a save error rather than throwing, so a lapsed session shows up as one
 * failed autosave rather than an unhandled rejection.
 */
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await createBrowserClient().auth.getSession();
  return session?.access_token ?? null;
}

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

export default function ProfileForm({ initialData, mode, section, sessionId }: Props) {
  const [firstName, setFirstName] = useState(initialData.first_name ?? "");
  const [lastName, setLastName] = useState(initialData.last_name ?? "");
  const [zipcode, setZipcode] = useState(initialData.zipcode ?? "");
  const [languages, setLanguages] = useState<string[]>(initialData.language ?? []);
  const [parentType, setParentType] = useState<"mom" | "dad" | "anyone" | "">(initialData.parent_type ?? "anyone");
  const [availabilityDays, setAvailabilityDays] = useState<string[]>(initialData.availability?.days ?? []);
  const [availabilityTimes, setAvailabilityTimes] = useState<string[]>(initialData.availability?.times ?? []);
  const [matchPriority, setMatchPriority] = useState<"age" | "proximity" | "">(initialData.match_priority ?? "");
  const [openToSecondMatch, setOpenToSecondMatch] = useState<boolean>(initialData.open_to_second_match ?? true);
  const [children, setChildren] = useState<Child[]>(initialData.children ?? []);

  const firstNameField = useRequiredField("First name");
  const lastNameField = useRequiredField("Last name");

  const [zipcodeError, setZipcodeError] = useState<string | null>(null);
  const router = useRouter();

  // ---------------------------------------------------------------------
  // Profile mode: each section autosaves independently (see lib/use-autosave.ts).
  // Hooks are always called (Rules of Hooks) but guarded to no-ops outside
  // their own mode+section — the fields they track simply never change on
  // an instance whose inputs aren't rendered, so this is inert there
  // regardless, but the explicit guard keeps that obvious rather than
  // incidental.
  //
  // Email is read-only here, same treatment as PartnerContactForm: it's
  // also the sign-in identity (requireMember resolves it by matching the
  // verified session's email straight against members.email — see
  // lib/require-member.ts), and there's no separate Supabase-Auth-user
  // record kept in sync (see applyMemberProfileUpdate's docblock in
  // app/actions/profile.ts) — a self-service edit, typo'd or not, risks
  // locking a member out of their own login with no recovery path. Changes
  // go through us instead.
  // ---------------------------------------------------------------------

  const isPersonalSection = mode === "profile" && section === "personal";
  const isDetailsSection = mode === "profile" && section === "details";
  const isPreferencesSection = mode === "profile" && section === "preferences";

  const { status: nameStatus, error: nameError } = useAutosave(
    { firstName, lastName },
    async (v) => {
      const token = await getAccessToken();
      if (!token) return { success: false, error: SESSION_EXPIRED };
      try {
        await updateMemberProfile(token, { first_name: v.firstName, last_name: v.lastName });
        return { success: true };
      } catch {
        return { success: false, error: "Couldn't save — try again" };
      }
    },
    { skip: (v) => !isPersonalSection || !v.firstName.trim() || !v.lastName.trim() },
  );

  const { status: detailsStatus, error: detailsError } = useAutosave(
    { zipcode, languages, availabilityDays, availabilityTimes, children },
    async (v) => {
      const token = await getAccessToken();
      if (!token) return { success: false, error: SESSION_EXPIRED };
      const availability: Availability | null =
        v.availabilityDays.length > 0 || v.availabilityTimes.length > 0
          ? { days: v.availabilityDays, times: v.availabilityTimes }
          : null;
      try {
        await updateMemberProfile(token, {
          zipcode: v.zipcode || null,
          language: v.languages.length > 0 ? v.languages : null,
          availability,
          children: v.children.length > 0 ? v.children : null,
        });
        return { success: true };
      } catch {
        return { success: false, error: "Couldn't save — try again" };
      }
    },
    // Skipped (not just errored) while zipcode is present-but-invalid, same as
    // the rest of this section pre-autosave: an in-progress postcode used to
    // block the whole section's Save button, not just zipcode itself.
    { skip: (v) => !isDetailsSection || (!!v.zipcode && !DUTCH_POSTCODE.test(v.zipcode)) },
  );

  const { status: preferencesStatus, error: preferencesError } = useAutosave(
    { parentType, matchPriority, openToSecondMatch },
    async (v) => {
      const token = await getAccessToken();
      if (!token) return { success: false, error: SESSION_EXPIRED };
      try {
        await updateMemberProfile(token, {
          parent_type: (v.parentType as "mom" | "dad" | "anyone") || "anyone",
          match_priority: (v.matchPriority as "age" | "proximity") || null,
          open_to_second_match: v.openToSecondMatch,
        });
        return { success: true };
      } catch {
        return { success: false, error: "Couldn't save — try again" };
      }
    },
    { skip: () => !isPreferencesSection },
  );

  // ---------------------------------------------------------------------
  // Onboarding mode: unchanged from before autosave — a first-run wizard
  // ending in "All done →", not a persistent settings page, so a single
  // explicit submit (then redirect to the freshly-minted sign-in link) is
  // the right shape here, not autosave.
  // ---------------------------------------------------------------------

  const [onboardingPending, startOnboardingTransition] = useTransition();
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOnboardingError(null);

    if (zipcode && !DUTCH_POSTCODE.test(zipcode)) {
      setZipcodeError("Enter a valid Dutch postcode, e.g. 1234 AB");
      return;
    }
    setZipcodeError(null);

    const availability: Availability | null =
      availabilityDays.length > 0 || availabilityTimes.length > 0
        ? { days: availabilityDays, times: availabilityTimes }
        : null;

    const updates = {
      zipcode: zipcode || null,
      language: languages.length > 0 ? languages : null,
      availability,
      match_priority: (matchPriority as "age" | "proximity") || null,
      children: children.length > 0 ? children : null,
    };

    startOnboardingTransition(async () => {
      try {
        // Onboarding: no auth session exists yet — both the update and the
        // sign-in link are authorized by the verified Stripe checkout session,
        // never a client-supplied id/email (audit Finding 1 / S1 PP twin).
        await updateOnboardingProfile(sessionId ?? "", updates);
        const link = await getOnboardingSignInLink(sessionId ?? "");
        router.push(link);
      } catch {
        setOnboardingError("Failed to save changes. Please try again.");
      }
    });
  }

  const title = section ? SECTION_TITLES[section] : null;
  const sectionStatus =
    section === "personal" ? { status: nameStatus, error: nameError }
    : section === "details" ? { status: detailsStatus, error: detailsError }
    : section === "preferences" ? { status: preferencesStatus, error: preferencesError }
    : null;

  return (
    <form onSubmit={mode === "onboarding" ? handleOnboardingSubmit : (e) => e.preventDefault()} className="space-y-5">
      {/* Section header with autosave status — profile mode only */}
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-dark">{title}</h2>
          {sectionStatus && <AutosaveStatus status={sectionStatus.status} error={sectionStatus.error} />}
        </div>
      )}

      {/* Personal fields — profile/personal section only */}
      {section === "personal" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelClass}>
                First name <RequiredMark />
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); firstNameField.clear(); }}
                onBlur={() => firstNameField.onBlur(firstName)}
                autoComplete="given-name"
                className={`${inputClass} ${firstNameField.error ? "border-coral" : ""}`}
              />
              {firstNameField.error && <p className="mt-1 text-xs text-coral">{firstNameField.error}</p>}
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>
                Last name <RequiredMark />
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); lastNameField.clear(); }}
                onBlur={() => lastNameField.onBlur(lastName)}
                autoComplete="family-name"
                className={`${inputClass} ${lastNameField.error ? "border-coral" : ""}`}
              />
              {lastNameField.error && <p className="mt-1 text-xs text-coral">{lastNameField.error}</p>}
            </div>
          </div>

          {/* Email is read-only — see the docblock above the autosave hooks. */}
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={initialData.email ?? ""}
              disabled
              readOnly
              className={disabledInputClass}
            />
            <p className="mt-1 text-xs text-muted">
              If you need to change your contact email, please contact us at{" "}
              <a href="mailto:post@amsterdamparentproject.nl" className="text-coral hover:text-coral-dark underline">
                post@amsterdamparentproject.nl
              </a>.
            </p>
          </div>
        </>
      )}

      {/* Languages — details section and onboarding */}
      {(section === "details" || mode === "onboarding") && (
        <div>
          <label className={labelClass}>Languages</label>
          <p className="text-xs italic text-muted mb-2">
            We&apos;ll only pair you with someone you can talk to
          </p>
          <div className="flex gap-2">
            {LANGUAGES.map(({ value, label }) => (
              <ToggleButton
                key={value}
                selected={languages.includes(value)}
                onClick={() =>
                  setLanguages((prev) =>
                    prev.includes(value)
                      ? prev.filter((l) => l !== value)
                      : [...prev, value]
                  )
                }
              >
                {label}
              </ToggleButton>
            ))}
          </div>
        </div>
      )}

      {/* Availability — details section and onboarding */}
      {(section === "details" || mode === "onboarding") && (
        <>
          <hr className="border-border" />
          <div>
            <label className={labelClass}>Availability</label>
            <p className="text-xs italic text-muted mb-3">
              When you&apos;re free to meet your match
            </p>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted my-2">
              <CalendarIcon />Days
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DAYS.map(({ value, label }) => (
                <ToggleButton
                  key={value}
                  selected={availabilityDays.includes(value)}
                  onClick={() =>
                    setAvailabilityDays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
                    )
                  }
                >
                  {label}
                </ToggleButton>
              ))}
            </div>
            {ENABLE_TIME_OF_DAY && (<>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted my-2">
              <ClockIcon />Time of day
            </p>
            <div className="flex gap-2">
              {TIMES.map(({ value, label }) => (
                <ToggleButton
                  key={value}
                  selected={availabilityTimes.includes(value)}
                  onClick={() =>
                    setAvailabilityTimes((prev) =>
                      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
                    )
                  }
                >
                  {label}
                </ToggleButton>
              ))}
            </div>
            </>)}
          </div>
        </>
      )}

      {/* Zip code — details section and onboarding */}
      {(section === "details" || mode === "onboarding") && (
        <>
          <hr className="border-border" />
          <div>
            <label htmlFor="zipcode" className={labelClass}>
              Zip code
            </label>
            <p className="text-xs italic text-muted mb-3">
              For finding matches nearby
            </p>
            <input
              id="zipcode"
              type="text"
              value={zipcode}
              onChange={(e) => { setZipcode(e.target.value); setZipcodeError(null); }}
              onBlur={() => {
                if (zipcode && !DUTCH_POSTCODE.test(zipcode)) {
                  setZipcodeError("Enter a valid Dutch postcode, e.g. 1234 AB");
                }
              }}
              autoComplete="postal-code"
              placeholder="1234 AB"
              className={`${inputClass} ${zipcodeError ? "border-coral" : ""}`}
            />
            {zipcodeError && <p className="mt-1 text-xs text-coral">{zipcodeError}</p>}
          </div>
        </>
      )}

      {/* Children — details section and onboarding */}
      {(section === "details" || mode === "onboarding") && (
        <>
        <hr className="border-border" />
         <div>
          <label className={labelClass}>Children</label>
          <p className="text-xs italic text-muted mb-3">
            For finding matches with kids of a similar age
          </p>
          <div className="space-y-2">
            {children.map((child, i) => (
              <ChildRow
                key={i}
                child={child}
                onChange={(updated) =>
                  setChildren((prev) => prev.map((c, idx) => (idx === i ? updated : c)))
                }
                onRemove={() => setChildren((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setChildren((prev) => [
                ...prev,
                { birth_month: new Date().getMonth() + 1, birth_year: new Date().getFullYear(), expected: false },
              ])
            }
            className="mt-3 text-sm text-coral hover:underline font-medium"
          >
            + Add a child
          </button>
        </div>
        </>
      )}

      {/* Parent type — preferences section only */}
      {(section === "preferences" || mode === "onboarding") && (
        <>
        {mode === "onboarding" && <hr className="border-border" />}
        <div>
          <label htmlFor="parentType" className={labelClass}>Who would you like to meet?</label>
          <p className="text-xs italic text-muted mb-2">
            Let us know if you&apos;d prefer to meet with moms or dads — or anyone in our community.
          </p>
          <div className="relative">
            <select
              id="parentType"
              value={parentType}
              onChange={(e) => setParentType(e.target.value as "mom" | "dad" | "anyone" | "")}
              className={selectClass}
            >
              <option value="anyone">Anyone</option>
              <option value="mom">Moms</option>
              <option value="dad">Dads</option>
            </select>
            <ChevronDown />
          </div>
        </div>
        </>
      )}

      {/* Match priority — preferences section and onboarding */}
      {(section === "preferences") && (
        <div>
          <label htmlFor="matchPriority" className={labelClass}>What matters more to you in a match?</label>
          <p className="text-xs italic text-muted mb-2">
            Choose between someone nearby or with kids of a similar age. This is to help us prioritize — we can&apos;t guarantee either!
          </p>
          <div className="relative">
            <select
              id="matchPriority"
              value={matchPriority}
              onChange={(e) => setMatchPriority(e.target.value as "age" | "proximity" | "")}
              className={selectClass}
            >
              <option value="">No preference</option>
              <option value="age">Kids of a similar age</option>
              <option value="proximity">Someone close by</option>
            </select>
            <ChevronDown />
          </div>
        </div>
      )}

      {/* Open to second match — preferences section only */}
      {section === "preferences" && (
        <div>
          <label htmlFor="openToSecondMatch" className={labelClass}>Open to a second match?</label>
          <p className="text-xs italic text-muted mb-2">
            If there&apos;s an odd number of members this month, we may pair you with two people instead of one.
          </p>
          <div className="relative">
            <select
              id="openToSecondMatch"
              value={openToSecondMatch ? "yes" : "no"}
              onChange={(e) => setOpenToSecondMatch(e.target.value === "yes")}
              className={selectClass}
            >
              <option value="yes">Yes, I&apos;m open to it</option>
              <option value="no">Only one match, please</option>
            </select>
            <ChevronDown />
          </div>
        </div>
      )}

      {/* Bottom submit — onboarding only */}
      {mode === "onboarding" && (
        <div className="flex items-center gap-4 pt-1">
          <button
            type="submit"
            disabled={onboardingPending}
            className="py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {onboardingPending ? "Saving…" : "All done →"}
          </button>
          {onboardingError && <p className="text-sm text-coral">{onboardingError}</p>}
        </div>
      )}
    </form>
  );
}
