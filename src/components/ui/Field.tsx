"use client";

const inputBase =
  "font-body text-[0.9rem] px-3.5 py-2.5 rounded-sm border border-border-strong bg-surface-raised text-ink placeholder:text-ink-faint outline-none transition-[border-color,box-shadow] duration-150 hover:border-ink-faint focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-glow)] min-w-0";

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
      <span className="text-[0.8rem] font-semibold text-ink-soft">{label}</span>
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
