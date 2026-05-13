import Image from "next/image";
import Link from "next/link";

export default function UnsubscribeConfirmed() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Postpartum Post" width={40} height={40} />
          <span
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md w-full">
          <div className="text-5xl mb-6">🌿</div>
          <h1
            className="text-3xl font-semibold text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            You've been unsubscribed
          </h1>
          <p className="text-muted leading-relaxed mb-8">
            Your subscription has been cancelled. You won't be charged again, and you won't receive any more matches.
          </p>
          <p className="text-muted text-sm leading-relaxed mb-10">
            We hope Postpartum Post was useful while it lasted. If you ever want to come back — whether your little one is 3 months or 3 years old — the door is always open.
          </p>
          <Link
            href="/"
            className="py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Back to home
          </Link>
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
