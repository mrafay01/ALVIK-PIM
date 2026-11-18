import Link from "next/link";
import { LayoutDashboard, BookOpenCheck, ClipboardList, PackageSearch, ArrowLeft, Compass } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/buttonStyles";

const SHORTCUTS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/catalog", label: "Catalog", icon: BookOpenCheck },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/items", label: "Un-Verified Items", icon: PackageSearch },
];

export default function NotFound() {
  return (
    <main
      className="relative min-h-screen overflow-hidden flex items-center justify-center p-5"
      style={{
        background:
          "radial-gradient(1000px 560px at 50% -10%, var(--brand-glow), transparent 60%), var(--surface-sunken)",
      }}
    >
      {/* Faceted gem-cut line pattern — brand motif shared with the login screen */}
      <svg aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="facet-grid-404" width="120" height="104" patternUnits="userSpaceOnUse">
            <path
              d="
                M60 0 L120 26 L120 78 L60 104 L0 78 L0 26 Z
                M60 0 L60 104
                M0 26 L60 52 L120 26
                M0 78 L60 52 L120 78
                M60 52 L60 104
              "
              fill="none"
              stroke="var(--brand)"
              strokeWidth="1"
            />
          </pattern>
          <radialGradient id="facet-mask-404" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="white" stopOpacity="0.03" />
            <stop offset="55%" stopColor="white" stopOpacity="0.06" />
            <stop offset="100%" stopColor="white" stopOpacity="0.4" />
          </radialGradient>
          <mask id="facet-visibility-404">
            <rect width="100%" height="100%" fill="url(#facet-mask-404)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#facet-grid-404)" mask="url(#facet-visibility-404)" />
      </svg>

      <div className="relative w-full max-w-[460px] text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-brand-bg border border-[color:var(--brand-glow)] mb-6">
          <Compass size={28} color="var(--brand)" strokeWidth={1.75} />
        </div>

        <div
          className="font-display font-bold text-ink tracking-tight"
          style={{ fontSize: "clamp(3.5rem, 10vw, 5rem)", lineHeight: 1 }}
        >
          404
        </div>

        <h1 className="text-[1.3rem] mt-3.5 mb-2.5 text-ink">Page not found</h1>
        <p className="text-ink-soft text-[0.92rem] leading-[1.6] mb-8">This link may be out of date.</p>

        <div className="flex justify-center mb-8">
          <Link href="/dashboard" className={buttonClasses("primary")}>
            <ArrowLeft size={15} />
            Back to Dashboard
          </Link>
        </div>

        <Card className="text-left">
          <div className="text-[0.68rem] font-bold text-ink-faint uppercase tracking-wide mb-3">Or jump straight to</div>
          <div className="flex flex-col gap-0.5">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="czc-row flex items-center gap-[11px] px-2.5 py-2 rounded-sm no-underline text-[0.87rem] font-medium text-ink-soft"
              >
                <s.icon size={16} color="var(--ink-faint)" strokeWidth={2} />
                {s.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
