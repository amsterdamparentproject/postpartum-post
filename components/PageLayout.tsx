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
      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
