export default function GiftBow({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/bow.svg" alt="" aria-hidden="true" className={className} />
  );
}
