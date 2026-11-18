"use client";

import { Loader2 } from "lucide-react";
import { buttonClasses, type ButtonVariant, type ButtonSize } from "./buttonStyles";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  disabled,
  loading = false,
  type = "button",
  onClick,
  className,
  style,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Shows a spinner and blocks clicks while an action is in flight. */
  loading?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const blocked = disabled || loading;
  return (
    <button
      type={type}
      disabled={blocked}
      aria-busy={loading || undefined}
      onClick={onClick}
      className={`${buttonClasses(variant, size)} ${
        loading ? "cursor-wait opacity-80" : disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer opacity-100"
      } ${className ?? ""}`}
      style={style}
    >
      {loading && <Loader2 size={size === "sm" ? 12 : 14} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
}
