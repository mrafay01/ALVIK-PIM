"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/buttonStyles";

export function QuoteHeaderActions({
  quotationId,
  purchaseOrderId,
  poNumber,
  canDelete,
  fileUrl,
  fileName,
}: {
  quotationId: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  /** The uploaded PO/PI file in SharePoint, for file-upload quotes. */
  fileUrl?: string | null;
  fileName?: string | null;
  /** True only while no row of this quote has been committed. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(
        fileUrl
          ? "Delete this quote and all its staged rows? Its uploaded file moves to the SharePoint recycle bin."
          : "Delete this quote and all its staged rows? This can't be undone."
      )) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't delete the quote.");
        return;
      }
      router.replace("/purchase-orders/quotes");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (!purchaseOrderId && !canDelete && !fileUrl) return null;

  return (
    <div className="flex items-center gap-2.5 flex-wrap mb-5">
      {purchaseOrderId && (
        <Link
          href={`/purchase-orders/${purchaseOrderId}`}
          className="flex items-center gap-1.5 font-display font-semibold text-[0.85rem] px-4 py-2 rounded-full bg-brand-bg text-brand border border-[color:var(--brand-glow)] no-underline hover:brightness-110"
        >
          <ClipboardList size={14} /> View purchase order{poNumber ? ` ${poNumber}` : ""}
        </Link>
      )}
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "sm")}
        >
          <FileSpreadsheet size={14} /> Open {fileName ?? "file"} in SharePoint
        </a>
      )}
      {canDelete && (
        <Button variant="danger" size="sm" disabled={deleting} onClick={remove}>
          <span className="flex items-center gap-1.5">
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete quote"}
          </span>
        </Button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
