"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (res.ok) {
        router.push("/admin/matches");
      } else {
        setError("Incorrect secret.");
        setSecret("");
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#f0f1f5] flex items-center justify-center px-6">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 w-full max-w-sm space-y-5">
        <h1 className="text-base font-semibold text-dark">Admin access</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Secret"
            required
            autoFocus
            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending || !secret}
            className="w-full py-2 px-4 text-sm bg-dark text-white rounded-lg hover:bg-dark/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
