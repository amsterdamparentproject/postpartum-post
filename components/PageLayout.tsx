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
        <p>© {new Date().getFullYear()} Postpartum Post. All rights reserved.</p>
        <p>A project by{" "}
          <a
            href="https://amsterdamparentproject.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Amsterdam Parent Project
          </a>
        </p>
      </footer>
    </div>
  );
}
