export default function CalloutBox({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 text-center ${className}`}>
      {children}
    </div>
  );
}
