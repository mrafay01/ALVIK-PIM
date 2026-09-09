"use client";

import { useState } from "react";
import { Search, ImageOff, ImageIcon, CheckCircle2 } from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MOCK_ITEMS, STATUS_LABEL, STATUS_TONE } from "@/components/present/mockData";

export default function ItemsPresentPage() {
  const [query, setQuery] = useState("");

  const filtered = MOCK_ITEMS.filter((item) => {
    const q = query.toLowerCase();
    return (
      !q ||
      item.vendorName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.itemNumber ?? item.sampleSku).toLowerCase().includes(q)
    );
  });

  return (
    <PresentShell eyebrow="Product spine" title="Items">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Every product moves through one 14-stage lifecycle — from an incoming vendor quote to a live
        catalog listing — carrying a temporary sample SKU and, once confirmed, a permanent item number.
      </p>

      <div className="flex items-center mb-[18px]">
        <div className="relative w-[280px]">
          <Search size={15} color="var(--ink-faint)" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendor, category, SKU…"
            className="w-full py-2.5 pr-3 pl-[34px] rounded-sm border border-border-strong bg-surface text-ink text-[0.86rem] outline-none"
          />
        </div>
      </div>

      <Card padding={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[760px]">
            <thead>
              <tr>
                {["SKU", "Vendor", "Category", "Metal", "MSRP", "Status", "Images", "Master record"].map((h) => (
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
              {filtered.map((item) => {
                const imgCount = Object.values(item.imageCompleteness).filter(Boolean).length;
                return (
                  <tr key={item.id} className="border-b border-border">
                    <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">
                      {item.itemNumber ?? item.sampleSku}
                      {!item.itemNumber && (
                        <span className="block text-[0.68rem] text-ink-faint font-normal">sample only</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.85rem]">{item.vendorName}</td>
                    <td className="px-4 py-3 text-[0.85rem] text-ink-soft">{item.category}</td>
                    <td className="px-4 py-3 text-[0.85rem] text-ink-soft">{item.metal}</td>
                    <td className="px-4 py-3 font-mono text-[0.85rem]">{item.msrp ? `$${item.msrp}` : "—"}</td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 ${imgCount === 3 ? "text-good" : "text-ink-faint"}`}>
                        {imgCount === 3 ? <ImageIcon size={14} /> : <ImageOff size={14} />}
                        <span className="text-[0.78rem] font-mono">{imgCount}/3</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.masterRecordComplete ? (
                        <span className="flex items-center gap-1.5 text-good text-[0.8rem] font-semibold">
                          <CheckCircle2 size={14} /> Complete
                        </span>
                      ) : (
                        <span className="text-[0.8rem] text-ink-faint">Incomplete</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PresentShell>
  );
}
