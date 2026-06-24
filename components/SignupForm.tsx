"use client";

import { useState, useTransition } from "react";
import { signup, type SignupFormData } from "@/app/actions/signup";
import { PLANS, resolvePlans, defaultPlan } from "@/lib/plans";

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
  lockedPlan,
  giftCode,
}: {
  first20SpotsRemaining?: number | null;
  pilotOnly?: boolean;
  onSubmitHover?: (hovering: boolean) => void;
  lockedPlan?: SignupFormData["plan"];
  giftCode?: string;
}) {
  const first20SoldOut = first20SpotsRemaining === 0;

  const plans = resolvePlans(PLANS, pilotOnly, first20SoldOut);

  const [isPending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState<SignupFormData["plan"]>(
    lockedPlan ?? defaultPlan(pilotOnly)
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);

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
      firstName: (form.elements.namedItem("firstName") as HTMLInputElement).value.trim(),
      lastName: (form.elements.namedItem("lastName") as HTMLInputElement).value.trim(),
      email: emailValue.trim(),
      plan: selectedPlan,
      eligibilityConfirmed,
      guidelinesAccepted,
      ...(giftCode ? { giftCode } : {}),
    };

    startTransition(async () => {
      const result = await signup(data);
      if (result?.error) {
        setError(result.error);
      }
    });
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
        {lockedPlan ? (() => {
          const plan = PLANS.find((p) => p.value === lockedPlan)!;
          return (
            <div className="p-4 rounded-lg border-2 border-coral bg-coral/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">{plan.icon}</span>
                <span className="text-xs font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">Gift</span>
              </div>
              <span className="block text-lg font-semibold text-dark leading-tight">
                <span className="line-through text-muted font-normal mr-1">{plan.price}</span>€0
              </span>
              <span className="block text-sm font-medium text-dark mt-0.5 mb-1">{plan.name}</span>
              <span className="block text-xs text-muted">{plan.billing}</span>
            </div>
          );
        })() : <div className="space-y-3">
          {/* Featured plan — full width */}
          {plans.filter((p) => p.featured && !p.hidden).map((plan) => {
            const isSelected = selectedPlan === plan.value;
            const isSoldOut = plan.value === "first20_3mo" && first20SoldOut;
            return (
              <button
                key={plan.value}
                type="button"
                onClick={() => !isSoldOut && setSelectedPlan(plan.value)}
                disabled={isSoldOut}
                data-umami-event="Home: Select Plan"
                data-umami-event-plan={plan.value}
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
                    {plan.value === "first20_3mo" && first20SpotsRemaining != null && (
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

          {/* Regular plans */}
          <div className="grid grid-cols-1 gap-3">
            {plans.filter((p) => !p.featured && !p.hidden).map((plan) => {
              const isSelected = selectedPlan === plan.value;
              const disabled = plan.comingSoon;
              return (
                <button
                  key={plan.value}
                  type="button"
                  onClick={() => !disabled && setSelectedPlan(plan.value)}
                  disabled={disabled}
                  data-umami-event="Home: Select Plan"
                  data-umami-event-plan={plan.value}
                  className={`text-left p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-coral/40 ${
                    disabled
                      ? "border-border bg-gray-50 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-coral bg-coral/5"
                      : "border-border bg-white hover:border-coral/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{plan.icon}</span>
                    {plan.comingSoon ? (
                      <span className="text-xs font-medium text-muted bg-gray-100 px-2 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    ) : plan.badge && (
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
          </div>
        </div>}
      </div>

      {/* Consent checkboxes */}
      <div className="space-y-3 pt-1">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={eligibilityConfirmed}
            onChange={(e) => setEligibilityConfirmed(e.target.checked)}
            required
            className="mt-0.5 shrink-0 accent-coral"
          />
          <span className="text-sm text-dark leading-snug">
            I am a parent (or expecting a child) and 18 or older
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={guidelinesAccepted}
            onChange={(e) => setGuidelinesAccepted(e.target.checked)}
            required
            className="mt-0.5 shrink-0 accent-coral"
          />
          <span className="text-sm text-dark leading-snug">
            I agree to the{" "}
            <a href="/community-guidelines" target="_blank" rel="noopener noreferrer" className="underline hover:text-coral transition-colors">
              Community Guidelines
            </a>
          </span>
        </label>
      </div>

      {error && (
        <p className="text-sm text-coral">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        onMouseEnter={() => onSubmitHover?.(true)}
        onMouseLeave={() => onSubmitHover?.(false)}
        data-umami-event="Home: Subscribe"
        data-umami-event-plan={selectedPlan}
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {isPending ? "Redirecting to checkout…" : "Subscribe"}
      </button>
    </form>
  );
}
