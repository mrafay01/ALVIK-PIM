// Shared button look (Alvik-style pill buttons). Lives outside Button.tsx
// ("use client") so server components can style a <Link> as a button with
// exactly the same classes: className={buttonClasses("primary")}.
//
// Fills are a soft gradient with a darker bottom edge (inset shadow) so they
// read as slightly raised, and press down 1px on click. `live:` (a variant
// defined in tailwind.config.ts) means "not disabled", so the hover/press
// effects work on links and enabled buttons but never on a disabled button.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[image:linear-gradient(180deg,var(--brand-fill-hover),var(--brand-fill-deep))] text-on-brand border border-transparent shadow-btn live:hover:brightness-[1.06] live:hover:-translate-y-px live:active:translate-y-px live:active:brightness-95",
  secondary:
    "bg-surface-raised text-ink border border-border shadow-btn-quiet live:hover:text-brand live:hover:border-border-strong live:active:translate-y-px",
  danger:
    "bg-critical-bg text-critical border border-transparent live:hover:brightness-110 live:active:translate-y-px live:active:brightness-95",
  ghost: "bg-transparent text-ink-soft border border-transparent live:hover:text-ink live:hover:bg-surface-overlay",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-[0.8rem] px-3.5 py-1.5",
  md: "text-[0.9rem] px-5 py-2.5",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-display font-semibold rounded-full leading-tight no-underline transition-[background-color,color,border-color,box-shadow,transform,filter] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
}
