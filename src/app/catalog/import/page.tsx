import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ArrowRight, ListChecks, ShieldCheck, Upload } from "lucide-react";
import { UploadForm } from "./UploadForm";

const BATCH_STATUS_TONE: Record<string, "good" | "warn" | "brass" | "neutral"> = {
  parsing: "neutral",
  needs_review: "warn",
  reviewed: "brass",
  committed: "good",
};

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

const STEPS = [
  { icon: Upload, title: "Upload", text: "Drop the Master File export. Every row is read and checked." },
  { icon: ListChecks, title: "Review", text: "Filter, sort and untick any rows you don't want. Fix flagged values inline." },
  { icon: ShieldCheck, title: "Commit", text: "Approved rows are written to the catalog. Nothing changes before that." },
];

// Master File import, reached from the Catalog page (admin only). Same
// staged flow as before: upload -> review every row -> commit approved rows.
export default async function CatalogImportPage() {
  if ((await getSessionRole()) !== "administrator") redirect("/unauthorized");
  await connectDB();

  const batches = await ImportBatch.find({})
    .select("sourceFileName uploadedAt status totalRows flaggedRows approvedRows rejectedRows")
    .sort({ uploadedAt: -1 })
    .limit(50)
    .lean();

  return (
    <AppShell
      activeHref="/catalog"
      backHref="/catalog"
      backLabel="Catalog"
      eyebrow="Catalog"
      title="Import Master File"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="flex items-start gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-brass-bg text-brass shrink-0">
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
                  {["File", "Uploaded", "Status", "Rows", "Flagged", "Approved", "Rejected", ""].map((h, i) => (
                    <th key={i} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={String(b._id)} className="czc-row border-b border-border">
                    <td className={TD_CLASS}>
                      <Link
                        href={`/catalog/import/${b._id}`}
                        className="font-semibold text-[0.85rem] text-navy-deep no-underline"
                      >
                        {b.sourceFileName}
                      </Link>
                    </td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {b.uploadedAt ? new Date(b.uploadedAt).toLocaleString() : "—"}
                    </td>
                    <td className={TD_CLASS}>
                      <Pill tone={BATCH_STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className={`${TD_CLASS} font-mono`}>{b.totalRows}</td>
                    <td className={`${TD_CLASS} font-mono ${b.flaggedRows > 0 ? "text-warn" : "text-ink-soft"}`}>
                      {b.flaggedRows}
                    </td>
                    <td className={`${TD_CLASS} font-mono text-good`}>{b.approvedRows}</td>
                    <td className={`${TD_CLASS} font-mono text-critical`}>{b.rejectedRows}</td>
                    <td className={`${TD_CLASS} text-right`}>
                      {b.status !== "committed" && (
                        <Link
                          href={`/catalog/import/${b._id}`}
                          className="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-brass no-underline"
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
