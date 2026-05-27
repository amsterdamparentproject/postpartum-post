import Link from "next/link";
import Header from "@/components/Header";

interface PageLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
  activeRoute?: string;
}

export default function PageLayout({ children, showNav, activeRoute }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header showNav={showNav} activeRoute={activeRoute} />
      {children}
      <footer className="py-8 text-center text-xs md:text-sm text-muted border-t border-border leading-relaxed">
        <p className="text-dark">A project by{" "}
          <a
            href="https://amsterdamparentproject.nl"
            target="_blank"
            rel="noopener noreferrer"
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
