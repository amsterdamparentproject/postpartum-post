"use client";

import { useState, useTransition } from "react";
import { signup, type SignupFormData } from "@/app/actions/signup";

const PLANS = [
  { value: "commitment_6mo", label: "€8/mo — 6-month commitment (billed €48 every 6 months)" },
  { value: "standard_monthly", label: "€12/mo — monthly, no commitment" },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";

const selectClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none pr-10";

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

export default function SignupForm() {
  const [isPending, startTransition] = useTransition();
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
      plan: (form.elements.namedItem("plan") as HTMLSelectElement).value as SignupFormData["plan"],
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
        <label htmlFor="plan" className={labelClass}>
          Plan <RequiredMark />
        </label>
        <div className="relative">
          <select
            id="plan"
            name="plan"
            required
            className={selectClass}
          >
            {PLANS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <ChevronDown />
        </div>
      </div>

      {error && (
        <p className="text-sm text-coral">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {isPending ? "Redirecting to checkout…" : "Subscribe"}
      </button>
    </form>
  );
}
