import { hasFullAccess } from "@/lib/enums";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ArrowRight, CheckCircle2, ListChecks, ShieldCheck, Upload } from "lucide-react";
import { UploadForm } from "./UploadForm";

// needs_review: rows still waiting on the review page (the only state that
// links back) · reviewed: the rest are in Flagged Items · committed: done.
const BATCH_STATUS: Record<string, { label: string; tone: "good" | "warn" | "brand" | "neutral" }> = {
  parsing: { label: "reading", tone: "neutral" },
  needs_review: { label: "needs review", tone: "warn" },
  reviewed: { label: "rest in Flagged Items", tone: "brand" },
  committed: { label: "done", tone: "good" },
};

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

const STEPS = [
  { icon: Upload, title: "Upload", text: "Add the Master File." },
  { icon: ListChecks, title: "Review", text: "Save clean rows to the catalog." },
  { icon: ShieldCheck, title: "Fix", text: "Correct flagged rows, then save." },
];

// Master File import, reached from the Catalog page (admin only). Same
// staged flow as before: upload -> review every row -> commit approved rows.
export default async function CatalogImportPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  if (!hasFullAccess(await getSessionRole())) redirect("/unauthorized");
  const justFinished = (await searchParams).done === "1";
  await connectDB();

  const batches = await ImportBatch.find({})
    .select("sourceFileName uploadedAt status totalRows flaggedRows approvedRows rejectedRows")
    .sort({ uploadedAt: -1 })
    .limit(50)
    .lean();

  return (
    <AppShell
      activeHref="/catalog/import"
      backHref="/catalog"
      backLabel="Catalog"
      eyebrow="Catalog"
      title="Import Master File"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="flex items-start gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-brand-bg text-brand shrink-0">
              <s.icon size={17} />
            </span>
            <div>
              <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">Step {i + 1}</div>
              <div className="font-semibold text-[0.92rem] mb-0.5">{s.title}</div>
              <div className="text-[0.82rem] text-ink-soft">{s.text}</div>
            </div>
          </Card>
        ))}
      </div>

      {justFinished && (
        <Card className="mb-5 !border-good flex items-center gap-3">
          <CheckCircle2 size={18} className="text-good shrink-0" />
          <span className="text-[0.88rem]">
            That file has been fully reviewed. Anything sent to Flagged Items is waiting{" "}
            <Link href="/catalog/flagged" className="text-brand no-underline font-semibold">
              there
            </Link>
            .
          </span>
        </Card>
      )}

      <Card className="mb-8">
        <UploadForm />
      </Card>

      <h2 className="text-[0.95rem] mb-3.5">Recent imports</h2>
      {batches.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No imports yet.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["File", "Uploaded", "Status", "Rows", "Flagged", "Committed", "Excluded", ""].map((h, i) => (
                    <th key={i} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={String(b._id)} className="border-b border-border">
                    <td className={`${TD_CLASS} font-semibold`}>{b.sourceFileName}</td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {b.uploadedAt ? new Date(b.uploadedAt).toLocaleString() : "—"}
                    </td>
                    <td className={TD_CLASS}>
                      <Pill tone={BATCH_STATUS[b.status]?.tone ?? "neutral"}>
                        {BATCH_STATUS[b.status]?.label ?? b.status.replace(/_/g, " ")}
                      </Pill>
                    </td>
                    <td className={`${TD_CLASS} font-mono`}>{b.totalRows}</td>
                    <td className={`${TD_CLASS} font-mono ${b.flaggedRows > 0 ? "text-warn" : "text-ink-soft"}`}>
                      {b.flaggedRows}
                    </td>
                    <td className={`${TD_CLASS} font-mono text-good`}>{b.approvedRows}</td>
                    <td className={`${TD_CLASS} font-mono text-critical`}>{b.rejectedRows}</td>
                    <td className={`${TD_CLASS} text-right`}>
                      {b.status === "needs_review" && (
                        <Link
                          href={`/catalog/import/${b._id}`}
                          className="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-brand no-underline"
                        >
                          Continue review <ArrowRight size={13} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
