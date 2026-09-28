import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui/Card";
import { MARKETPLACE_EXPORT_PLATFORMS } from "@/lib/enums";
import { Store } from "lucide-react";

const PLATFORM_LABELS: Record<(typeof MARKETPLACE_EXPORT_PLATFORMS)[number], { name: string; format: string; blurb: string }> = {
  macys: { name: "Macy's", format: "XLSX", blurb: "Two-row header (display + machine key), ~65 columns." },
  target: { name: "Target", format: "CSV", blurb: "Single header row, Target-Plus custom fields." },
  belk: { name: "Belk", format: "XLSX", blurb: "Single header row, 153 columns." },
  kohls: { name: "Kohl's", format: "XLSX", blurb: "Two-row header (display + machine key), 493 columns." },
};

// This app never talks to a marketplace's own systems — it only builds the
// exact-format bulk-import file a person reviews here, then uploads to that
// marketplace by hand.
export default function MarketplaceExportIndexPage() {
  return (
    <AppShell activeHref="/marketplace-export" eyebrow="Bulk-import files" title="Marketplace Export">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Pick a marketplace, choose which items to include, review and fill in any
        marketplace-specific details, then download the exact bulk-import file for that
        platform. Nothing is sent anywhere automatically; you upload the downloaded file
        yourself on the marketplace&apos;s side.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[720px]">
        {MARKETPLACE_EXPORT_PLATFORMS.map((platform) => {
          const meta = PLATFORM_LABELS[platform];
          return (
            <a key={platform} href={`/marketplace-export/${platform}`} className="no-underline">
              <Card className="h-full hover:border-[color:var(--brass-glow)] transition-colors duration-150">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex items-center justify-center w-10 h-10 rounded-sm bg-brass-bg text-brass shrink-0">
                    <Store size={19} />
                  </span>
                  <div className="font-display font-bold text-lg text-ink">{meta.name}</div>
                  <span className="ml-auto text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint bg-neutral-pill px-2 py-1 rounded-full">
                    {meta.format}
                  </span>
                </div>
                <p className="text-[0.83rem] text-ink-soft m-0">{meta.blurb}</p>
              </Card>
            </a>
          );
        })}
      </div>
    </AppShell>
  );
}
