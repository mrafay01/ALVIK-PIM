export function Card({
  children,
  padding = 22,
  className,
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    // suppressHydrationWarning: browser extensions (Bitdefender's
    // Anti-tracker being the common one) inject a bis_skin_checked
    // attribute onto plain wrapper divs after they scan the page, which
    // React otherwise flags as a hydration mismatch even though the actual
    // rendered content is identical. Cosmetic-only; real mismatches still
    // surface normally. Card is used everywhere, so this one spot covers
    // most of the app's div-wrapper noise.
    <div
      className={`bg-surface-raised border border-border rounded-md shadow-sm ${className ?? ""}`}
      style={{ padding, ...style }}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
