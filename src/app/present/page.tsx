import Link from "next/link";
import {
  Gem,
  ClipboardList,
  Wallet,
  BookOpenCheck,
  FileSpreadsheet,
  ArrowUpRight,
  CircleAlert,
  Layers,
  TrendingUp,
} from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Pill } from "@/components/ui/Pill";
import {
  MOCK_ITEMS,
  MOCK_POS,
  MOCK_PAYMENTS,
  STATUS_LABEL,
  STATUS_TONE,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
} from "@/components/present/mockData";

const MODULES = [
  {
    href: "/present/items",
    icon: Gem,
    name: "Items",
    status: "Live",
    tone: "good" as const,
    desc: "Product lifecycle from vendor quote to catalog listing — 14-stage status, dual SKU (sample + permanent), master record gate.",
  },
  {
    href: "/present/purchase-orders",
    icon: ClipboardList,
    name: "Purchase Orders",
    status: "Live",
    tone: "good" as const,
    desc: "Vendor PO/PI pipeline replacing 6 Monday.com boards with one status-filtered collection, plus the back-office checklist hard gate.",
  },
  {
    href: "/present/payables",
    icon: Wallet,
    name: "Payables",
    status: "Live",
    tone: "good" as const,
    desc: "Tranche-based vendor payments (deposit/balance/prepayment/credit), due-date auto-calc from vendor terms, overdue flagging.",
  },
  {
    href: "/present/catalog",
    icon: BookOpenCheck,
    name: "Catalog Completion Gate",
    status: "Live",
    tone: "good" as const,
    desc: "An item can't publish to marketplace export until category, metal, MSRP, and all three image subfolders are confirmed complete.",
  },
  {
    href: "/present/import-review",
    icon: FileSpreadsheet,
    name: "Legacy Import Review",
    status: "Live",
    tone: "good" as const,
    desc: "Staged, human-reviewed Excel Master File import — coercion, duplicate detection, and flagging before anything commits.",
  },
];

export default function PresentDashboard() {
  const liveItems = MOCK_ITEMS.filter((i) => i.status === "live").length;
  const readyToShip = MOCK_POS.filter((p) => p.status === "ready_to_ship").length;
  const overdue = MOCK_PAYMENTS.filter((p) => p.overdue).length;
  const poTotal = MOCK_POS.reduce((sum, p) => sum + p.poTotal, 0);

  return (
    <PresentShell eyebrow="Overview" title="Dashboard">
      <div className="grid gap-4 mb-9" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <StatTile
          label="Items tracked"
          value={String(MOCK_ITEMS.length)}
          icon={Gem}
          tone="brass"
          sub={`${liveItems} live on catalog`}
        />
        <StatTile
          label="Open purchase orders"
          value={String(MOCK_POS.length)}
          icon={ClipboardList}
          tone="brass"
          sub={`$${poTotal.toLocaleString()} total value`}
        />
        <StatTile
          label="Ready to ship"
          value={String(readyToShip)}
          icon={TrendingUp}
          tone="good"
          sub="All 6 checklist fields complete"
        />
        <StatTile
          label="Overdue payables"
          value={String(overdue)}
          icon={CircleAlert}
          tone={overdue > 0 ? "critical" : "good"}
          sub={overdue > 0 ? "Needs attention" : "Nothing overdue"}
        />
      </div>

      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[1.05rem]">Built modules</h2>
        <span className="text-[0.8rem] text-ink-faint">5 of 12 project phases complete</span>
      </div>

      <div className="grid gap-4 mb-9" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href} className="no-underline">
              <Card className="czc-card-link h-full flex flex-col gap-3 cursor-pointer">
                <div className="flex items-center justify-between">
                  <span className="flex items-center justify-center w-[34px] h-[34px] rounded-sm bg-brass-bg text-brass">
                    <Icon size={17} strokeWidth={2} />
                  </span>
                  <Pill tone={m.tone} dot>
                    {m.status}
                  </Pill>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-[0.98rem] text-ink mb-1.5">
                    {m.name}
                    <ArrowUpRight size={14} color="var(--ink-faint)" />
                  </div>
                  <p className="text-[0.85rem] text-ink-soft m-0 max-w-[48ch]">{m.desc}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-[1.2fr_1fr] gap-5">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={16} color="var(--brass)" />
              <h3 className="text-[0.95rem]">Recent item activity</h3>
            </div>
            <Link href="/present/items" className="text-[0.8rem] text-brass no-underline font-semibold">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-0.5">
            {MOCK_ITEMS.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between px-1 py-2.5 border-b border-border">
                <div>
                  <div className="font-mono text-[0.82rem] font-semibold">{item.itemNumber ?? item.sampleSku}</div>
                  <div className="text-[0.78rem] text-ink-faint">
                    {item.vendorName} · {item.category}
                  </div>
                </div>
                <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} color="var(--brass)" />
              <h3 className="text-[0.95rem]">PO pipeline snapshot</h3>
            </div>
            <Link href="/present/purchase-orders" className="text-[0.8rem] text-brass no-underline font-semibold">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-0.5">
            {MOCK_POS.slice(0, 5).map((po) => (
              <div key={po.id} className="flex items-center justify-between px-1 py-2.5 border-b border-border">
                <div>
                  <div className="font-mono text-[0.82rem] font-semibold">PO {po.poNumber}</div>
                  <div className="text-[0.78rem] text-ink-faint">{po.vendorName}</div>
                </div>
                <Pill tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PresentShell>
  );
}
