import Link from "next/link";
import Header from "@/components/Header";
import JoinReminderBanner from "@/components/JoinReminderBanner";
import OptinReminderBanner from "@/components/OptinReminderBanner";

interface PageLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
  activeRoute?: string;
}

export default function PageLayout({ children, showNav, activeRoute }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Opt-in window banner — "join before the deadline" for a logged-out
          visitor, or "you have N days left to opt in" for a logged-in member
          who hasn't responded yet. Full-width, above the header, on every
          page — each banner checks its own session state and renders
          nothing when it doesn't apply, so exactly one (or neither) shows. */}
      <JoinReminderBanner />
      <OptinReminderBanner />
      <Header showNav={showNav} activeRoute={activeRoute} />
      {children}
      <footer className="py-8 text-center text-xs md:text-sm text-muted border-t border-border leading-relaxed">
        <p className="text-dark">A project by{" "}
          <a
            href="https://amsterdamparentproject.nl"
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="Footer: Amsterdam Parent Project"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Amsterdam Parent Project
          </a>
        </p>
        <p className="mt-2 space-x-4">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-coral transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="underline underline-offset-2 hover:text-coral transition-colors">Terms of Service</Link>
          <Link href="/community-guidelines" className="underline underline-offset-2 hover:text-coral transition-colors">Community Guidelines</Link>
        </p>
        <p className="mt-0">© {new Date().getFullYear()} Postpartum Post. All rights reserved.</p>
      </footer>
    </div>
  );
}
