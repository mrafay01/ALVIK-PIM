"use client";

const inputBase =
  "font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]";

export function Field({
  label,
  children,
  width,
}: {
  label: string;
  children: React.ReactNode;
  width?: number | string;
}) {
  return (
    <label className="flex flex-col gap-1.5" style={{ width }}>
      <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-critical text-[0.82rem] mt-1.5 flex items-center gap-1.5">{children}</p>;
}
