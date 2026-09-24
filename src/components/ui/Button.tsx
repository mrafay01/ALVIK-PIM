"use client";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brass text-on-brass border border-brass shadow-[0_2px_10px_var(--brass-glow)] hover:enabled:bg-brass-hover hover:enabled:border-brass-hover hover:enabled:-translate-y-px hover:enabled:shadow-[0_4px_16px_var(--brass-glow)] active:enabled:brightness-95 active:enabled:translate-y-0 active:enabled:shadow-[0_1px_4px_var(--brass-glow)]",
  secondary:
    "bg-surface text-ink border border-border-strong hover:enabled:border-brass hover:enabled:text-brass active:enabled:bg-surface-sunken",
  danger:
    "bg-critical-bg text-critical border border-critical-bg hover:enabled:brightness-110 active:enabled:brightness-95",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:enabled:text-ink hover:enabled:bg-surface-overlay",
};

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-[0.8rem] px-3 py-1.5",
  md: "text-[0.87rem] px-4 py-2.5",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  disabled,
  type = "button",
  onClick,
  className,
  style,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`font-body font-semibold rounded-sm transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer opacity-100"
      } ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ""}`}
      style={style}
    >
      {children}
    </button>
  );
}
