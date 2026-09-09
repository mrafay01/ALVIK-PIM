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
    <div
      className={`bg-surface-raised border border-border rounded-md shadow-sm ${className ?? ""}`}
      style={{ padding, ...style }}
    >
      {children}
    </div>
  );
}
