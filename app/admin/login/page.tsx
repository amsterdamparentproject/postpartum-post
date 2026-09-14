"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/admin/matches");
      } else {
        setError("Incorrect username or password.");
        setPassword("");
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#f0f1f5] flex items-center justify-center px-6">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 w-full max-w-sm space-y-5">
        <h1 className="text-base font-semibold text-dark">Admin access</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            autoFocus
            autoComplete="username"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending || !username || !password}
            className="w-full py-2 px-4 text-sm bg-dark text-white rounded-lg hover:bg-dark/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
