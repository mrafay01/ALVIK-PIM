"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function PaymentRow({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter();
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function patchPayment(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/payables/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "paid" || status === "archived") {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className="flex gap-1.5 items-center">
      <Input
        placeholder="proof-of-payment URL"
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
        className="!w-[160px]"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => patchPayment({ status: "paid", proofOfPaymentUrl: proofUrl || undefined })}
      >
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Mark paid
        </span>
      </Button>
    </div>
  );
}
