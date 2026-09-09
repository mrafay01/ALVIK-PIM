"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function IntakeForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [vendorSku, setVendorSku] = useState("");
  const [category, setCategory] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [msrp, setMsrp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          vendorSku,
          category: category || undefined,
          costPerUnit: costPerUnit ? Number(costPerUnit) : undefined,
          msrp: msrp ? Number(msrp) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create item");
        return;
      }
      router.push(`/items/${data.item._id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (vendors.length === 0) {
    return (
      <p className="text-critical text-[0.87rem] flex items-center gap-1.5">
        <CircleAlert size={15} /> No vendors seeded yet — run the seed script first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3.5 items-end flex-wrap">
      <Field label="Vendor" width={160}>
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Vendor SKU" width={140}>
        <Input value={vendorSku} onChange={(e) => setVendorSku(e.target.value)} required />
      </Field>
      <Field label="Category" width={130}>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ring, Pendant…" />
      </Field>
      <Field label="Cost / unit" width={90}>
        <Input type="number" step="0.01" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} />
      </Field>
      <Field label="MSRP" width={90}>
        <Input type="number" step="0.01" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Creating…" : "Intake quote"}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
