"use client";

import { useState, useTransition } from "react";
import { signup, type SignupFormData } from "@/app/actions/signup";
import { joinWaitlist } from "@/app/actions/waitlist";

const PLANS: {
  value: SignupFormData["plan"];
  icon: string;
  price: string;
  name: string;
  billing: string;
  description?: string;
  badge?: string;
  featured?: boolean;
}[] = [
  {
    value: "first20_6mo",
    icon: "🎉",
    price: "€5/mo",
    name: "First 20: Our founding members",
    billing: "Billed €30 every 6 months",
    description: "A special forever price for our earliest subscribers — €5/mo for as long as you're with us.",
    badge: "Until 1 July",
    featured: true,
  },
  {
    value: "commitment_6mo",
    icon: "⭐",
    price: "€8/mo",
    name: "6-month commitment",
    billing: "Billed €48 every 6 months",
    description: "Skip any month and we'll extend your subscription — no penalty, no questions asked.",
    badge: "Best value",
  },
  {
    value: "standard_monthly",
    icon: "📅",
    price: "€12/mo",
    name: "Monthly",
    billing: "Billed monthly",
    description: "Skip any month with one tap — your next billing date adjusts automatically.",
  },
];

function WaitlistForm() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value;
    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      const result = await joinWaitlist(email);
      if (result.success) {
        setDone(true);
      } else {
        setError("Something went wrong — please try again.");
      }
    });
  }

  if (done) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-2xl">💌</p>
        <p className="text-sm font-semibold text-dark">You&apos;re on the list!</p>
        <p className="text-sm text-muted leading-relaxed">
          We&apos;ll let you know as soon as general signups open on 1 July.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border-2 border-coral/40 bg-coral/5 px-5 py-4 text-center space-y-1">
        <p className="text-sm font-semibold text-coral">Our founding spots are full 🎉</p>
        <p className="text-sm text-muted leading-relaxed">
          Leave your email and we&apos;ll let you know when general signups open on 1 July.
        </p>
      </div>
      <div>
        <label htmlFor="waitlist-email" className={labelClass}>
          Email <span className="text-coral ml-0.5">*</span>
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          onChange={() => setEmailError(null)}
          onBlur={(e) => {
            if (e.target.value && !EMAIL_RE.test(e.target.value)) {
              setEmailError("Enter a valid email address");
            }
          }}
          className={`${inputClass} ${emailError ? "border-coral" : ""}`}
        />
        {emailError && <p className="mt-1 text-xs text-coral">{emailError}</p>}
      </div>
      {error && <p className="text-sm text-coral">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Joining…" : "Notify me"}
      </button>
    </form>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const labelClass = "block text-sm font-medium text-dark mb-1";

function RequiredMark() {
  return <span className="text-coral ml-0.5">*</span>;
}

export default function SignupForm({
  first20SpotsRemaining,
  pilotOnly = false,
  onSubmitHover,
}: {
  first20SpotsRemaining?: number | null;
  pilotOnly?: boolean;
  onSubmitHover?: (hovering: boolean) => void;
}) {
  const first20SoldOut = first20SpotsRemaining === 0;

  const [isPending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState<SignupFormData["plan"]>(
    pilotOnly ? "first20_6mo" : "commitment_6mo"
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const emailValue = (form.elements.namedItem("email") as HTMLInputElement).value;

    if (!EMAIL_RE.test(emailValue)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);

    const data: SignupFormData = {
      firstName: (form.elements.namedItem("firstName") as HTMLInputElement).value,
      lastName: (form.elements.namedItem("lastName") as HTMLInputElement).value,
      email: emailValue,
      plan: selectedPlan,
    };

    startTransition(async () => {
      try {
        await signup(data);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  }

  // Waitlist mode — FIRST20 sold out during pilot period
  if (pilotOnly && first20SoldOut) {
    return <WaitlistForm />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className={labelClass}>
            First name <RequiredMark />
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            required
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
            name="lastName"
            type="text"
            required
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
          name="email"
          type="email"
          required
          autoComplete="email"
          onChange={() => setEmailError(null)}
          onBlur={(e) => {
            if (e.target.value && !EMAIL_RE.test(e.target.value)) {
              setEmailError("Enter a valid email address");
            }
          }}
          className={`${inputClass} ${emailError ? "border-coral" : ""}`}
        />
        {emailError && <p className="mt-1 text-xs text-coral">{emailError}</p>}
      </div>

      <div>
        <p className={labelClass}>
          Plan <RequiredMark />
        </p>
        <div className="space-y-3">
          {/* Featured plan — full width */}
          {PLANS.filter((p) => p.featured).map((plan) => {
            const isSelected = selectedPlan === plan.value;
            const isSoldOut = plan.value === "first20_6mo" && first20SoldOut;
            return (
              <button
                key={plan.value}
                type="button"
                onClick={() => !isSoldOut && setSelectedPlan(plan.value)}
                disabled={isSoldOut}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-coral/40 ${
                  isSoldOut
                    ? "border-border bg-gray-50 opacity-60 cursor-not-allowed"
                    : isSelected
                    ? "border-coral bg-coral/5"
                    : "border-border bg-white hover:border-coral/50"
                }`}
              >
                {/* Icon left, badges right */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{plan.icon}</span>
                  <div className="flex items-center gap-2">
                    {plan.value === "first20_6mo" && first20SpotsRemaining != null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        first20SoldOut
                          ? "bg-gray-100 text-gray-400"
                          : first20SpotsRemaining <= 5
                          ? "bg-red-50 text-red-500"
                          : "bg-coral/10 text-coral"
                      }`}>
                        {first20SoldOut ? "Sold out" : `${first20SpotsRemaining} left`}
                      </span>
                    )}
                    {plan.badge && !first20SoldOut && (
                      <span className="text-xs font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                </div>
                <span className="block text-lg font-semibold text-dark leading-tight">{plan.price}</span>
                <span className="block text-sm font-medium text-dark mt-0.5 mb-1">{plan.name}</span>
                <span className="block text-xs text-muted mb-2">{plan.billing}</span>
                {plan.description && (
                  <span className="block text-sm text-muted leading-relaxed">{plan.description}</span>
                )}
              </button>
            );
          })}

          {/* Regular plans — hidden during pilot period */}
          {!pilotOnly && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLANS.filter((p) => !p.featured).map((plan) => {
              const isSelected = selectedPlan === plan.value;
              return (
                <button
                  key={plan.value}
                  type="button"
                  onClick={() => setSelectedPlan(plan.value)}
                  className={`text-left p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-coral/40 ${
                    isSelected
                      ? "border-coral bg-coral/5"
                      : "border-border bg-white hover:border-coral/50"
                  }`}
                >
                  {/* Icon left, badges right */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{plan.icon}</span>
                    {plan.badge && (
                      <span className="text-xs font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <span className="block text-lg font-semibold text-dark">{plan.price}</span>
                  <span className="block text-sm font-medium text-dark mt-0.5 mb-1">{plan.name}</span>
                  <span className="block text-xs text-muted">{plan.billing}</span>
                  {plan.description && (
                    <span className="block text-sm text-muted leading-relaxed mt-2">{plan.description}</span>
                  )}
                </button>
              );
            })}
          </div>}
        </div>
      </div>

      {error && (
        <p className="text-sm text-coral">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        onMouseEnter={() => onSubmitHover?.(true)}
        onMouseLeave={() => onSubmitHover?.(false)}
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {isPending ? "Redirecting to checkout…" : "Subscribe"}
      </button>
    </form>
  );
}
