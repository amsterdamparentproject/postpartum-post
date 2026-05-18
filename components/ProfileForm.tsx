"use client";

import { useState, useTransition, useEffect } from "react";
import { updateMemberProfile, type MemberProfile, type Topic, type Availability, type Child } from "@/app/actions/profile";
import CalloutBox from "@/components/CalloutBox";

const DUTCH_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MATCH_TYPES = [
  { value: "", label: "No preference" },
  { value: "in_person", label: "In person" },
  { value: "online", label: "Online" },
] as const;

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
const CHILD_YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 1 - i); // +1 for due dates

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
  topics: Topic[];
  mode: "onboarding" | "profile";
  section?: "personal" | "preferences";
};

const SECTION_TITLES: Record<string, string> = {
  personal: "Personal info",
  preferences: "Preferences",
};

export default function ProfileForm({ memberId, initialData, topics, mode, section }: Props) {
  const [firstName, setFirstName] = useState(initialData.first_name ?? "");
  const [lastName, setLastName] = useState(initialData.last_name ?? "");
  const [email, setEmail] = useState(initialData.email ?? "");
  const [zipcode, setZipcode] = useState(initialData.zipcode ?? "");
  const [language, setLanguage] = useState(initialData.language ?? "");
  const [topicId, setTopicId] = useState(initialData.topic_id ?? "");
  const [matchType, setMatchType] = useState(initialData.match_type ?? "");
  const [availabilityDays, setAvailabilityDays] = useState<string[]>(initialData.availability?.days ?? []);
  const [availabilityTimes, setAvailabilityTimes] = useState<string[]>(initialData.availability?.times ?? []);
  const [matchPriority, setMatchPriority] = useState<"age" | "proximity" | "">(initialData.match_priority ?? "");
  const [children, setChildren] = useState<Child[]>(initialData.children ?? []);

  // Snapshot of last-saved values — used to compute isDirty
  const [snapshot, setSnapshot] = useState({
    firstName: initialData.first_name ?? "",
    lastName: initialData.last_name ?? "",
    email: initialData.email ?? "",
    zipcode: initialData.zipcode ?? "",
    language: initialData.language ?? "",
    topicId: initialData.topic_id ?? "",
    matchType: initialData.match_type ?? "",
    availabilityDays: initialData.availability?.days ?? [] as string[],
    availabilityTimes: initialData.availability?.times ?? [] as string[],
    matchPriority: initialData.match_priority ?? "",
    children: initialData.children ?? [] as Child[],
  });

  const isDirty =
    section === "personal"
      ? firstName !== snapshot.firstName ||
        lastName !== snapshot.lastName ||
        email !== snapshot.email ||
        zipcode !== snapshot.zipcode
      : section === "preferences"
      ? language !== snapshot.language ||
        topicId !== snapshot.topicId ||
        matchType !== snapshot.matchType ||
        matchPriority !== snapshot.matchPriority ||
        !arrEq(availabilityDays, snapshot.availabilityDays) ||
        !arrEq(availabilityTimes, snapshot.availabilityTimes) ||
        JSON.stringify(children) !== JSON.stringify(snapshot.children)
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

  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setSaveError(null);

    if (section === "personal" || mode === "onboarding") {
      if (section === "personal" && !EMAIL_RE.test(email)) {
        setEmailError("Enter a valid email address");
        return;
      }
      setEmailError(null);
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

    // Each section saves only its own fields
    const updates =
      section === "personal"
        ? { first_name: firstName, last_name: lastName, email, zipcode: zipcode || null }
        : section === "preferences"
        ? {
            language: (language as "english" | "dutch") || null,
            topic_id: topicId || null,
            match_type: (matchType as "in_person" | "online") || null,
            availability,
            match_priority: (matchPriority as "age" | "proximity") || null,
            children: children.length > 0 ? children : null,
          }
        : // onboarding: zip + availability + children + match priority
          {
            zipcode: zipcode || null,
            availability,
            match_priority: (matchPriority as "age" | "proximity") || null,
            children: children.length > 0 ? children : null,
          };

    startTransition(async () => {
      try {
        await updateMemberProfile(memberId, initialData.email ?? email, updates);
        setSaved(true);
        // Advance snapshot so isDirty resets
        setSnapshot({
          firstName, lastName, email, zipcode,
          language, topicId, matchType,
          availabilityDays: [...availabilityDays],
          availabilityTimes: [...availabilityTimes],
          matchPriority,
          children: [...children],
        });
      } catch {
        setSaveError("Failed to save changes. Please try again.");
      }
    });
  }

  if (saved && mode === "onboarding") {
    return (
      <CalloutBox>
        <div className="text-4xl mb-4">💌</div>
        <h2 className="text-2xl font-semibold text-dark mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          You&apos;re all set!
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          Your welcome email is on its way. It has everything you need to know about what happens next.
        </p>
      </CalloutBox>
    );
  }

  const title = section ? SECTION_TITLES[section] : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Section header with inline save button — profile mode only */}
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-dark">{title}</h2>
          <div className="flex items-center gap-3">
            {saveError && <p className="text-xs text-coral">{saveError}</p>}
            {isDirty
              ? <p className="text-xs font-medium text-amber-600">Unsaved changes</p>
              : saved
              ? <p className="text-xs text-muted">Saved!</p>
              : null
            }
            <button
              type="submit"
              disabled={isPending}
              className={`py-1.5 px-4 text-sm font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed ${
                isDirty
                  ? "bg-dark hover:bg-coral-dark text-white shadow-sm ring-2 ring-coral/20"
                  : "bg-white border border-border text-muted cursor-default"
              }`}
            >
              {isPending ? "Saving…" : "Save"}
            </button>
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

      {/* Zip code — personal section and onboarding */}
      {(section === "personal" || mode === "onboarding") && (
        <div>
          <label htmlFor="zipcode" className={labelClass}>
            Zip code {section === "personal" && <RequiredMark />}
          </label>
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
      )}

      {/* Availability — preferences section and onboarding */}
      {(section === "preferences" || mode === "onboarding") && (
        <div>
          <label className={labelClass}>Availability</label>
          <p className="text-xs italic text-muted mb-3">
            Select all that apply.
          </p>
          <p className="flex items-center gap-1.5 text-xs font-medium text-coral my-2">
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
          <p className="flex items-center gap-1.5 text-xs font-medium text-coral my-2">
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
        </div>
      )}

      {/* Children — preferences section and onboarding */}
      {(section === "preferences" || mode === "onboarding") && (
        <div>
          <label className={labelClass}>Children</label>
          <p className="text-xs italic text-muted mb-3">
            Add your child or children so we can find families at a similar stage.
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
      )}

      {/* Match priority — preferences section and onboarding */}
      {(section === "preferences" || mode === "onboarding") && (
        <div>
          <label className={labelClass}>What matters more to you in a match?</label>
          <p className="text-xs italic text-muted mb-2">
            We&apos;ll use this to prioritize when we can&apos;t have it all.
          </p>
          <div className="flex gap-2">
            <ToggleButton
              selected={matchPriority === "age"}
              onClick={() => setMatchPriority(matchPriority === "age" ? "" : "age")}
            >
              Kids of a similar age
            </ToggleButton>
            <ToggleButton
              selected={matchPriority === "proximity"}
              onClick={() => setMatchPriority(matchPriority === "proximity" ? "" : "proximity")}
            >
              Someone close by
            </ToggleButton>
          </div>
        </div>
      )}

      {/* Language, topic, meetup — preferences section only (after match priority) */}
      {section === "preferences" && (
        <>
          <hr className="border-border" />

          <div>
            <label htmlFor="matchType" className={labelClass}>Default meet-up preference</label>
            <p className="text-xs italic text-muted mb-2">
              Do you prefer to meet in person or connect online?
            </p>
            <div className="relative">
              <select id="matchType" value={matchType} onChange={(e) => setMatchType(e.target.value)} className={selectClass}>
                {MATCH_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown />
            </div>
          </div>
        </>
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
}
