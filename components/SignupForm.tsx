"use client";

import { useState, useTransition } from "react";
import { signup, type SignupFormData } from "@/app/actions/signup";

const TOPICS = [
  { value: "just-coffee", label: "Just coffee" },
  { value: "newborn-chats", label: "Newborn chats" },
] as const;

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "dutch", label: "Dutch" },
  { value: "either", label: "Either" },
] as const;

export default function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const data: SignupFormData = {
      firstName: (form.elements.namedItem("firstName") as HTMLInputElement).value,
      lastName: (form.elements.namedItem("lastName") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      zipcode: (form.elements.namedItem("zipcode") as HTMLInputElement).value,
      topic: (form.elements.namedItem("topic") as HTMLSelectElement).value as SignupFormData["topic"],
      language: (form.elements.namedItem("language") as HTMLSelectElement).value as SignupFormData["language"],
    };

    startTransition(async () => {
      try {
        await signup(data);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError("Something went wrong. Please try again.");
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-dark mb-1">
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            required
            autoComplete="given-name"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-dark mb-1">
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            required
            autoComplete="family-name"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-dark mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
        />
      </div>

      <div>
        <label htmlFor="zipcode" className="block text-sm font-medium text-dark mb-1">
          Zip code
        </label>
        <input
          id="zipcode"
          name="zipcode"
          type="text"
          required
          autoComplete="postal-code"
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
        />
      </div>

      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-dark mb-1">
          Topic
        </label>
        <select
          id="topic"
          name="topic"
          required
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none"
        >
          {TOPICS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="language" className="block text-sm font-medium text-dark mb-1">
          Language preference
        </label>
        <select
          id="language"
          name="language"
          required
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition appearance-none"
        >
          {LANGUAGES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
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
