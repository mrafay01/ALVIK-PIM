"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Variation = { suffix: string; plating: string; upc: string; msrp: string };

const emptyVariation = (): Variation => ({ suffix: "", plating: "", upc: "", msrp: "" });

export function NewCatalogItemForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [metal, setMetal] = useState("");
  const [plating, setPlating] = useState("");
  const [msrp, setMsrp] = useState("");
  const [upc, setUpc] = useState("");
  const [bullets, setBullets] = useState("");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateVariation(idx: number, key: keyof Variation, value: string) {
    setVariations((prev) => prev.map((v, i) => (i === idx ? { ...v, [key]: value } : v)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sku.trim() || !title.trim() || !category.trim()) {
      setError("SKU, title and category are required.");
      return;
    }
    if (sku.includes("-")) {
      setError("The main SKU shouldn't contain a hyphen — add variations below.");
      return;
    }

    const bulletFeatures = bullets
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 10);

    const payloadVariations = variations
      .filter((v) => v.suffix.trim())
      .map((v) => ({
        suffix: v.suffix.trim(),
        plating: v.plating.trim() || undefined,
        upc: v.upc.trim() || undefined,
        msrp: v.msrp.trim() ? Number(v.msrp) : undefined,
      }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim(),
          brand: brand.trim() || undefined,
          metal: metal.trim() || undefined,
          plating: plating.trim() || undefined,
          msrp: msrp.trim() ? Number(msrp) : undefined,
          upc: upc.trim() || undefined,
          bulletFeatures: bulletFeatures.length ? bulletFeatures : undefined,
          variations: payloadVariations.length ? payloadVariations : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the item");
        return;
      }
      router.push(`/items/${data.baseItemId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-[760px]">
      <Card>
        <h2 className="text-[0.95rem] mb-3.5">Product</h2>
        <div className="flex flex-col gap-3.5">
          <div className="flex gap-3.5 flex-wrap">
            <Field label="Base SKU" width={160}>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="A1234" required />
            </Field>
            <Field label="Category" width={160}>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ring" required />
            </Field>
            <Field label="Brand" width={160}>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]"
            />
          </Field>
          <Field label="Feature points (one per line, max 10)">
            <textarea
              value={bullets}
              onChange={(e) => setBullets(e.target.value)}
              rows={3}
              className="font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]"
            />
          </Field>
          <div className="flex gap-3.5 flex-wrap">
            <Field label="Metal" width={150}>
              <Input value={metal} onChange={(e) => setMetal(e.target.value)} placeholder="Silver" />
            </Field>
            <Field label="Plating" width={200}>
              <Input value={plating} onChange={(e) => setPlating(e.target.value)} />
            </Field>
            <Field label="MSRP" width={110}>
              <Input type="number" step="0.01" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
            </Field>
            <Field label="UPC" width={150}>
              <Input value={upc} onChange={(e) => setUpc(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[0.95rem] m-0">Variations</h2>
          <Button size="sm" onClick={() => setVariations((v) => [...v, emptyVariation()])}>
            <span className="flex items-center gap-1.5">
              <Plus size={13} /> Add variation
            </span>
          </Button>
        </div>
        {variations.length === 0 ? (
          <p className="text-ink-faint text-[0.85rem] m-0">
            None — just the base SKU. Add a row for each plating / stone / size variant (e.g.
            suffix <code className="font-mono">GP</code>, <code className="font-mono">RP</code>,{" "}
            <code className="font-mono">GP-6</code>).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {variations.map((v, i) => (
              <div key={i} className="flex gap-3 items-end flex-wrap p-3 rounded-sm bg-surface-sunken">
                <Field label={`Suffix → ${sku || "SKU"}-${v.suffix || "…"}`} width={130}>
                  <Input
                    value={v.suffix}
                    onChange={(e) => updateVariation(i, "suffix", e.target.value)}
                    placeholder="GP"
                  />
                </Field>
                <Field label="Plating" width={180}>
                  <Input value={v.plating} onChange={(e) => updateVariation(i, "plating", e.target.value)} />
                </Field>
                <Field label="UPC" width={140}>
                  <Input value={v.upc} onChange={(e) => updateVariation(i, "upc", e.target.value)} />
                </Field>
                <Field label="MSRP" width={100}>
                  <Input
                    type="number"
                    step="0.01"
                    value={v.msrp}
                    onChange={(e) => updateVariation(i, "msrp", e.target.value)}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setVariations((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting
            ? "Creating…"
            : `Create ${1 + variations.filter((v) => v.suffix.trim()).length} item${
                variations.filter((v) => v.suffix.trim()).length ? "s" : ""
              }`}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </form>
  );
}
