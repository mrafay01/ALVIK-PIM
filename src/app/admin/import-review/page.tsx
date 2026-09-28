import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
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

export default async function ImportReviewPage() {
  await connectDB();

  const batches = await ImportBatch.find({})
    .select("sourceFileName uploadedAt status totalRows flaggedRows approvedRows rejectedRows")
    .sort({ uploadedAt: -1 })
    .lean();

  return (
    <AppShell activeHref="/admin/import-review" eyebrow="Data migration" title="Legacy Import Review">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Upload the Master File export. Every row is parsed and staged here first; nothing writes
        to the product database until you approve it, row by row.
      </p>

      <Card className="mb-8">
        <h2 className="text-[0.95rem] mb-3.5">Upload a Master File</h2>
        <UploadForm />
      </Card>

      <h2 className="text-[0.95rem] mb-3.5">Batches ({batches.length})</h2>
      {batches.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No batches uploaded yet.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["File", "Uploaded", "Status", "Rows", "Flagged", "Approved", "Rejected"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={String(b._id)} className="border-b border-border">
                    <td className={TD_CLASS}>
                      <a href={`/admin/import-review/${b._id}`} className="font-semibold text-[0.85rem] text-navy-deep no-underline">
                        {b.sourceFileName}
                      </a>
                    </td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {b.uploadedAt ? new Date(b.uploadedAt).toLocaleString() : "—"}
                    </td>
                    <td className={TD_CLASS}>
                      <Pill tone={BATCH_STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className={`${TD_CLASS} font-mono`}>{b.totalRows}</td>
                    <td className={`${TD_CLASS} font-mono ${b.flaggedRows > 0 ? "text-warn" : "text-ink-soft"}`}>{b.flaggedRows}</td>
                    <td className={`${TD_CLASS} font-mono text-good`}>{b.approvedRows}</td>
                    <td className={`${TD_CLASS} font-mono text-critical`}>{b.rejectedRows}</td>
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
