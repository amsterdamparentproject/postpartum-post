"use client";

import { useState, useTransition, useEffect, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { generateMagicLink } from "@/app/actions/auth";
import { updateMemberProfile, type MemberProfile, type Availability, type Child } from "@/app/actions/profile";
import { ENABLE_TIME_OF_DAY } from "@/lib/flags";


const DUTCH_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


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

function RequiredMark() {
  return <span className="text-coral ml-0.5">*</span>;
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

/** Compare two string arrays regardless of insertion order */
function arrEq(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

type Props = {
  memberId: string;
  initialData: Partial<MemberProfile>;

  mode: "onboarding" | "profile";
  section?: "personal" | "details" | "preferences";
};

export type ProfileFormHandle = {
  save: () => void;
  isDirty: boolean;
  isPending: boolean;
};

const SECTION_TITLES: Record<string, string> = {
  personal: "Personal info",
  details: "Details",
  preferences: "Preferences",
};

const ProfileForm = forwardRef<ProfileFormHandle, Props>(function ProfileForm(
  { memberId, initialData, mode, section }: Props,
  ref,
) {
  const [firstName, setFirstName] = useState(initialData.first_name ?? "");
  const [lastName, setLastName] = useState(initialData.last_name ?? "");
  const [email, setEmail] = useState(initialData.email ?? "");
  const [zipcode, setZipcode] = useState(initialData.zipcode ?? "");
  const [languages, setLanguages] = useState<string[]>(initialData.language ?? []);
  const [parentType, setParentType] = useState<"mom" | "dad" | "anyone" | "">(initialData.parent_type ?? "anyone");
  const [availabilityDays, setAvailabilityDays] = useState<string[]>(initialData.availability?.days ?? []);
  const [availabilityTimes, setAvailabilityTimes] = useState<string[]>(initialData.availability?.times ?? []);
  const [matchPriority, setMatchPriority] = useState<"age" | "proximity" | "">(initialData.match_priority ?? "");
  const [openToSecondMatch, setOpenToSecondMatch] = useState<boolean>(initialData.open_to_second_match ?? true);
  const [children, setChildren] = useState<Child[]>(initialData.children ?? []);

  // Snapshot of last-saved values — used to compute isDirty
  const [snapshot, setSnapshot] = useState({
    firstName: initialData.first_name ?? "",
    lastName: initialData.last_name ?? "",
    email: initialData.email ?? "",
    zipcode: initialData.zipcode ?? "",
    languages: initialData.language ?? [] as string[],
    parentType: initialData.parent_type ?? "anyone",
    availabilityDays: initialData.availability?.days ?? [] as string[],
    availabilityTimes: initialData.availability?.times ?? [] as string[],
    matchPriority: initialData.match_priority ?? "",
    openToSecondMatch: initialData.open_to_second_match ?? true,
    children: initialData.children ?? [] as Child[],
  });

  const isDirty =
    section === "personal"
      ? firstName !== snapshot.firstName ||
        lastName !== snapshot.lastName ||
        email !== snapshot.email
      : section === "details"
      ? zipcode !== snapshot.zipcode ||
        !arrEq(languages, snapshot.languages) ||
        !arrEq(availabilityDays, snapshot.availabilityDays) ||
        !arrEq(availabilityTimes, snapshot.availabilityTimes) ||
        JSON.stringify(children) !== JSON.stringify(snapshot.children)
      : section === "preferences"
      ? matchPriority !== snapshot.matchPriority ||
        parentType !== snapshot.parentType ||
        openToSecondMatch !== snapshot.openToSecondMatch
      : // onboarding — always starts dirty (empty form)
        true;

  // Warn before closing/navigating away with unsaved profile changes
  useEffect(() => {
    if (!isDirty || mode === "onboarding") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, mode]);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [zipcodeError, setZipcodeError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  function doSave() {
    setSaved(false);
    setSaveError(null);

    if (section === "personal") {
      if (!EMAIL_RE.test(email)) {
        setEmailError("Enter a valid email address");
        return;
      }
      setEmailError(null);
    }
    if (section === "details" || mode === "onboarding") {
      if (zipcode && !DUTCH_POSTCODE.test(zipcode)) {
        setZipcodeError("Enter a valid Dutch postcode, e.g. 1234 AB");
        return;
      }
      setZipcodeError(null);
    }

    const availability: Availability | null =
      availabilityDays.length > 0 || availabilityTimes.length > 0
        ? { days: availabilityDays, times: availabilityTimes }
        : null;

    const updates =
      section === "personal"
        ? { first_name: firstName, last_name: lastName, email }
        : section === "details"
        ? {
            zipcode: zipcode || null,
            language: languages.length > 0 ? languages : null,
            availability,
            children: children.length > 0 ? children : null,
          }
        : section === "preferences"
        ? {
            parent_type: (parentType as "mom" | "dad" | "anyone") || "anyone",
            match_priority: (matchPriority as "age" | "proximity") || null,
            open_to_second_match: openToSecondMatch,
          }
        : {
            zipcode: zipcode || null,
            language: languages.length > 0 ? languages : null,
            availability,
            match_priority: (matchPriority as "age" | "proximity") || null,
            children: children.length > 0 ? children : null,
          };

    startTransition(async () => {
      try {
        await updateMemberProfile(memberId, initialData.email ?? email, updates);
        setSaved(true);
        if (mode === "onboarding") {
          // Generate a magic link so the new member is signed in as themselves,
          // regardless of who (if anyone) is currently authenticated in this browser.
          const link = await generateMagicLink(initialData.email ?? email);
          router.push(link);
          return;
        }
        setSnapshot({
          firstName, lastName, email, zipcode,
          languages: [...languages], parentType: (parentType || "anyone") as "mom" | "dad" | "anyone",
          availabilityDays: [...availabilityDays],
          availabilityTimes: [...availabilityTimes],
          matchPriority,
          openToSecondMatch,
          children: [...children],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("already associated")) {
          setEmailError(msg);
        } else {
          setSaveError("Failed to save changes. Please try again.");
        }
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSave();
  }

  useImperativeHandle(ref, () => ({ save: doSave, isDirty, isPending }));


  const title = section ? SECTION_TITLES[section] : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Section header with inline save button — profile mode only */}
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-dark">{title}</h2>
          <div className="flex items-center gap-3">
            {saveError && <p className="text-xs text-coral">{saveError}</p>}
          </div>
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
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className={inputClass}
              />
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
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email <RequiredMark />
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              onBlur={() => {
                if (email && !EMAIL_RE.test(email)) setEmailError("Enter a valid email address");
              }}
              autoComplete="email"
              className={`${inputClass} ${emailError ? "border-coral" : ""}`}
            />
            {emailError && <p className="mt-1 text-xs text-coral">{emailError}</p>}
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
              When you're free to meet your match
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
            Let us know if you'd prefer to meet with moms or dads — or anyone in our community.
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
            If there's an odd number of members this month, we may pair you with two people instead of one.
          </p>
          <div className="relative">
            <select
              id="openToSecondMatch"
              value={openToSecondMatch ? "yes" : "no"}
              onChange={(e) => setOpenToSecondMatch(e.target.value === "yes")}
              className={selectClass}
            >
              <option value="yes">Yes, I'm open to it</option>
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
            disabled={isPending}
            className="py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "All done →"}
          </button>
          {saveError && <p className="text-sm text-coral">{saveError}</p>}
        </div>
      )}
    </form>
  );
});

export default ProfileForm;
