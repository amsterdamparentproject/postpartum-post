import Image from "next/image";
import Link from "next/link";
import SignupForm from "@/components/SignupForm";

export default function Home() {
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
        <nav className="flex gap-6 text-sm font-medium text-muted">
          <Link href="/about" className="hover:text-dark transition">
            About
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full text-center mb-14">
          <h1
            className="text-5xl sm:text-6xl font-semibold leading-tight mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral italic">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-lg mx-auto">
            A thoughtful subscription pairing new parents with coffee, conversation,
            and real support — delivered to your door and your schedule.
          </p>
        </div>

        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2
            className="text-xl font-semibold text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Join the waitlist
          </h2>
          <p className="text-sm text-muted mb-6">
            Tell us a little about yourself to get started.
          </p>
          <SignupForm />
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
