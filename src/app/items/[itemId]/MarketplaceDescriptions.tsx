"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { DescriptionPlatform } from "@/lib/enums";
import { DESCRIPTION_PLATFORMS } from "@/lib/enums";
import { DESCRIPTION_PLATFORM_LABEL } from "@/lib/statusDisplay";

const textareaClass =
  "font-body text-[0.86rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)] resize-y min-h-[90px]";

type PlatformEntry = { text: string; overridden: boolean };

export function MarketplaceDescriptions({
  itemId,
  generalDescription,
  initial,
  canEdit,
}: {
  itemId: string;
  generalDescription: string;
  initial: Record<DescriptionPlatform, PlatformEntry>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<DescriptionPlatform, string>>(
    () =>
      Object.fromEntries(DESCRIPTION_PLATFORMS.map((p) => [p, initial[p].text])) as Record<
        DescriptionPlatform,
        string
      >
  );
  const [savingPlatform, setSavingPlatform] = useState<DescriptionPlatform | null>(null);
  const [savedPlatform, setSavedPlatform] = useState<DescriptionPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(platform: DescriptionPlatform) {
    setSavingPlatform(platform);
    setError(null);
    setSavedPlatform(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplaceDescription: { platform, text: drafts[platform] } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setSavedPlatform(platform);
      router.refresh();
    } finally {
      setSavingPlatform(null);
    }
  }

  return (
    <Card>
      <h2 className="text-[0.95rem] mb-1.5">Marketplace descriptions</h2>
      <p className="text-ink-soft text-[0.83rem] mb-3.5">
        Per-marketplace copy — falls back to the general description above until a platform gets its
        own. AI-assisted drafting from the title/description is planned; for now these are edited by
        hand.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {DESCRIPTION_PLATFORMS.map((platform) => {
          const draft = drafts[platform];
          const isOverridden = initial[platform].overridden;
          const dirty = draft !== initial[platform].text;
          return (
            <div key={platform} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.78rem] font-semibold text-ink">
                  {DESCRIPTION_PLATFORM_LABEL[platform]}
                </span>
                {!isOverridden && !draft && (
                  <span className="text-[0.7rem] text-ink-faint">using general description</span>
                )}
              </div>
              <textarea
                value={draft}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [platform]: e.target.value }))
                }
                placeholder={generalDescription || "No general description set yet."}
                rows={4}
                disabled={!canEdit}
                className={textareaClass}
              />
              {canEdit && (
                <div className="flex items-center gap-2.5">
                  <Button
                    size="sm"
                    disabled={!dirty || savingPlatform === platform}
                    onClick={() => save(platform)}
                  >
                    {savingPlatform === platform ? "Saving…" : "Save"}
                  </Button>
                  {savedPlatform === platform && !dirty && (
                    <span className="flex items-center gap-1 text-[0.78rem] text-good">
                      <Check size={13} /> Saved
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-critical text-[0.82rem] mt-3 mb-0">{error}</p>}
      <p className="flex items-center gap-1.5 text-ink-faint text-[0.76rem] mt-4 mb-0">
        <Sparkles size={12} /> AI-generated drafts from title/description are coming soon.
      </p>
    </Card>
  );
}
