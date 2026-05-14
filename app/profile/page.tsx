"use client";

import { useEffect, useState, useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import PageLayout from "@/components/PageLayout";
import {
  getMemberProfile,
  getTopics,
  getSubscriptionDetails,
  getCustomerPortalUrl,
  updateMemberProfile,
  type MemberProfile,
  type Topic,
  type SubscriptionDetails,
} from "@/app/actions/profile";

const LANGUAGES = [
  { value: "", label: "No preference" },
  { value: "english", label: "English" },
  { value: "dutch", label: "Dutch" },
] as const;

const MATCH_TYPES = [
  { value: "", label: "No preference" },
  { value: "in_person", label: "In person" },
  { value: "online", label: "Online" },
] as const;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  trialing: { label: "Trial", className: "bg-blue-100 text-blue-700" },
  past_due: { label: "Past due", className: "bg-yellow-100 text-yellow-700" },
  incomplete: { label: "Incomplete", className: "bg-yellow-100 text-yellow-700" },
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700" },
  canceled: { label: "Canceled", className: "bg-gray-100 text-gray-500" },
};

const DUTCH_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(unixTimestamp: number) {
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const selectClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-10";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const labelClass = "block text-sm font-medium text-dark mb-1";

function ChevronDown() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function RequiredMark() {
  return <span className="text-coral ml-0.5">*</span>;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [language, setLanguage] = useState("");
  const [topicId, setTopicId] = useState("");
  const [matchType, setMatchType] = useState("");

  const [emailError, setEmailError] = useState<string | null>(null);
  const [zipcodeError, setZipcodeError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [isProfilePending, startProfileTransition] = useTransition();
  const [isPortalPending, startPortalTransition] = useTransition();

  useEffect(() => {
    const supabase = createBrowserClient();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user?.email) {
          const [memberData, topicsData] = await Promise.all([
            getMemberProfile(session.user.email),
            getTopics(),
          ]);

          if (memberData) {
            setMember(memberData);
            setFirstName(memberData.first_name);
            setLastName(memberData.last_name);
            setEmail(memberData.email);
            setZipcode(memberData.zipcode ?? "");
            setLanguage(memberData.language ?? "");
            setTopicId(memberData.topic_id ?? "");
            setMatchType(memberData.match_type ?? "");

            getSubscriptionDetails(memberData.id).then(setSubscription);
          }

          setTopics(topicsData);
        }
        setLoading(false);
      }
    );

    return () => authSub.unsubscribe();
  }, []);

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setProfileSaved(false);
    setProfileError(null);

    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);

    if (zipcode && !DUTCH_POSTCODE.test(zipcode)) {
      setZipcodeError("Enter a valid Dutch postcode, e.g. 1234 AB");
      return;
    }
    setZipcodeError(null);

    startProfileTransition(async () => {
      try {
        await updateMemberProfile(member.id, member.email, {
          first_name: firstName,
          last_name: lastName,
          email,
          zipcode: zipcode || null,
          language: (language as "english" | "dutch") || null,
          topic_id: topicId || null,
          match_type: (matchType as "in_person" | "online") || null,
        });
        setMember((prev) => prev ? { ...prev, first_name: firstName, last_name: lastName, email } : prev);
        setProfileSaved(true);
      } catch {
        setProfileError("Failed to save changes. Please try again.");
      }
    });
  }

  function handleManageBilling() {
    if (!member?.stripe_customer_id) return;
    startPortalTransition(async () => {
      const url = await getCustomerPortalUrl(member.stripe_customer_id!);
      window.location.href = url;
    });
  }

  const planLabel = subscription?.price_lookup_key === "commitment_6mo"
    ? "6-month commitment (€8/mo)"
    : subscription?.price_lookup_key === "standard_monthly"
    ? "Monthly (€12/mo)"
    : null;

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] ?? { label: subscription.status, className: "bg-gray-100 text-gray-500" }
    : null;

  return (
    <PageLayout>
      <main className="flex-1 px-6 py-16 max-w-5xl mx-auto w-full">
        {loading ? (
          <p className="text-muted text-sm text-center">Loading your profile…</p>
        ) : !member ? (
          <div className="text-center">
            <p className="text-dark font-medium mb-2">You&apos;re not signed in.</p>
            <p className="text-muted text-sm">
              Check your email for a magic link to access your profile.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-semibold text-dark mb-1" style={{ fontFamily: "var(--font-serif)" }}>
                Your profile
              </h1>
              <p className="text-muted text-sm">
                {member.first_name} {member.last_name} · {member.email}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 items-start">
              {/* Profile form */}
              <form
                onSubmit={handleProfileSave}
                className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-5"
              >
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

                <div>
                  <label htmlFor="zipcode" className={labelClass}>
                    Zip code <RequiredMark />
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

                <hr className="border-border" />

                <div>
                  <label htmlFor="language" className={labelClass}>Language preference</label>
                  <p className="text-xs italic text-muted mb-2">
                    We'll try to match you with someone who speaks the same language.
                  </p>
                  <div className="relative">
                    <select
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={selectClass}
                    >
                      {LANGUAGES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown />
                  </div>
                </div>

                <div>
                  <label htmlFor="topic" className={labelClass}>Default topic</label>
                  <p className="text-xs italic text-muted mb-2">
                    What would you like to talk about? We'll use this to find you a better match.
                  </p>
                  <div className="relative">
                    <select
                      id="topic"
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">No preference</option>
                      {topics.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name.charAt(0).toUpperCase() + name.slice(1)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown />
                  </div>
                </div>

                <div>
                  <label htmlFor="matchType" className={labelClass}>Default meet-up preference</label>
                  <p className="text-xs italic text-muted mb-2">
                    Do you prefer to meet in person or connect online?
                  </p>
                  <div className="relative">
                    <select
                      id="matchType"
                      value={matchType}
                      onChange={(e) => setMatchType(e.target.value)}
                      className={selectClass}
                    >
                      {MATCH_TYPES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <button
                    type="submit"
                    disabled={isProfilePending}
                    className="py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isProfilePending ? "Saving…" : "Save changes"}
                  </button>
                  {profileSaved && <p className="text-sm text-muted">Changes saved.</p>}
                  {profileError && <p className="text-sm text-coral">{profileError}</p>}
                </div>
              </form>

              {/* Plan & billing */}
              <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 space-y-4">
                <h2 className="text-base font-semibold text-dark">Plan & billing</h2>

                {!subscription ? (
                  <p className="text-sm text-muted">No active subscription found.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">Status</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo?.className}`}>
                        {statusInfo?.label}
                      </span>
                    </div>

                    {subscription.current_period_end && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted">
                          {subscription.cancel_at_period_end ? "Cancels on" : "Next billing date"}
                        </span>
                        <span className="text-dark font-medium">
                          {formatDate(subscription.current_period_end)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">Consecutive skips</span>
                      <span className="text-dark font-medium">{member.consecutive_skips}</span>
                    </div>

                    {planLabel && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted">Plan</span>
                        <span className="text-dark font-medium">{planLabel}</span>
                      </div>
                    )}

                    <hr className="border-border" />

                    <button
                      onClick={handleManageBilling}
                      disabled={isPortalPending}
                      className="w-full py-2 px-4 text-sm border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isPortalPending ? "Redirecting…" : "Manage billing →"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </PageLayout>
  );
}
