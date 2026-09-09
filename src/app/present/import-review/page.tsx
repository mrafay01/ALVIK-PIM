"use client";

import { FileSpreadsheet, TriangleAlert, CircleCheck, Copy } from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MOCK_IMPORT_ROWS } from "@/components/present/mockData";

export default function ImportReviewPresentPage() {
  const flagged = MOCK_IMPORT_ROWS.filter((r) => r.flags.length > 0);
  const reviewed = MOCK_IMPORT_ROWS.filter((r) => r.reviewed).length;

  return (
    <PresentShell eyebrow="Data migration" title="Legacy Import Review">
      <p className="text-ink-soft max-w-[68ch] mb-3 text-[0.92rem]">
        The Excel Master File has real data-quality issues — dates stored as text, hand-typed metal
        names, stray placeholder cells. Rather than a one-shot migration script, every row is staged
        here for a human to confirm or correct before it ever reaches the live database.
      </p>

      <Card className="mb-6 flex items-center gap-3 bg-brass-bg !border-brass-soft">
        <FileSpreadsheet size={18} color="var(--brass)" />
        <span className="text-[0.85rem] text-ink">
          <strong>Master_File_2026.xlsx</strong> — {MOCK_IMPORT_ROWS.length} rows parsed, {reviewed} reviewed and approved,{" "}
          {flagged.length} flagged for attention
        </span>
      </Card>

      <Card padding={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[780px]">
            <thead>
              <tr>
                {["SKU", "Raw metal value", "Coerced value", "MSRP", "Flags", "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_IMPORT_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">{row.sku}</td>
                  <td className="px-4 py-3 font-mono text-[0.8rem] text-ink-faint">&quot;{row.rawMetal}&quot;</td>
                  <td className="px-4 py-3 text-[0.85rem]">
                    {row.coercedMetal ?? <span className="text-critical">Needs manual entry</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.85rem]">{row.msrp ? `$${row.msrp}` : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {row.flags.map((f, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[0.76rem] text-warn">
                          {row.duplicateOf ? <Copy size={12} /> : <TriangleAlert size={12} />}
                          {f}
                        </span>
                      ))}
                      {row.flags.length === 0 && <span className="text-[0.76rem] text-ink-faint">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.reviewed ? (
                      <Pill tone="good" dot>
                        Approved
                      </Pill>
                    ) : (
                      <Pill tone="warn" dot>
                        Needs review
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-2 mt-[18px] text-[0.8rem] text-ink-faint">
        <CircleCheck size={14} />
        Nothing is written to the live catalog until a human approves the row.
      </div>
    </PresentShell>
  );
}
