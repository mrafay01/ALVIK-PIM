"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// Per-variant fields — mirrors CatalogVariationSchema. Any left blank fall
// back to the shared/base value at submit time.
type Variation = {
  suffix: string;
  plating: string;
  upc: string;
  msrp: string;
  totalWeight: string;
  silverWeight: string;
  mainStoneInfo: string;
  mainStoneColor: string;
  mainStoneType: string;
  restStoneInfo: string;
  restStoneColor: string;
  restStoneType: string;
  stoneSetting: string;
  pearlSize: string;
  pearlType: string;
  lengthExtender: string;
  measurements: string;
  clasp: string;
  postLength: string;
  pushBackSize: string;
  thickness: string;
};

const emptyVariation = (): Variation => ({
  suffix: "",
  plating: "",
  upc: "",
  msrp: "",
  totalWeight: "",
  silverWeight: "",
  mainStoneInfo: "",
  mainStoneColor: "",
  mainStoneType: "",
  restStoneInfo: "",
  restStoneColor: "",
  restStoneType: "",
  stoneSetting: "",
  pearlSize: "",
  pearlType: "",
  lengthExtender: "",
  measurements: "",
  clasp: "",
  postLength: "",
  pushBackSize: "",
  thickness: "",
});

const inputClass =
  "font-body text-[0.86rem] px-3 py-2 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]";
const textareaClass =
  "font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left bg-transparent border-none p-0 cursor-pointer"
      >
        {open ? <ChevronDown size={15} className="text-ink-faint" /> : <ChevronRight size={15} className="text-ink-faint" />}
        <h2 className="text-[0.95rem] m-0">{title}</h2>
        {hint && <span className="text-[0.78rem] text-ink-faint ml-1">— {hint}</span>}
      </button>
      {open && <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">{children}</div>}
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

export function NewCatalogItemForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [title2, setTitle2] = useState("");
  const [description, setDescription] = useState("");
  const [description2, setDescription2] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [metal, setMetal] = useState("");
  const [plating, setPlating] = useState("");
  const [msrp, setMsrp] = useState("");
  const [newMsrp, setNewMsrp] = useState("");
  const [ruePrice, setRuePrice] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [upc, setUpc] = useState("");
  const [bullets, setBullets] = useState("");

  const [variationSku, setVariationSku] = useState("");
  const [variationTitle, setVariationTitle] = useState("");
  const [variationDescription, setVariationDescription] = useState("");

  const [totalWeight, setTotalWeight] = useState("");
  const [silverWeight, setSilverWeight] = useState("");
  const [mainStoneInfo, setMainStoneInfo] = useState("");
  const [mainStoneColor, setMainStoneColor] = useState("");
  const [mainStoneType, setMainStoneType] = useState("");
  const [restStoneInfo, setRestStoneInfo] = useState("");
  const [restStoneColor, setRestStoneColor] = useState("");
  const [restStoneType, setRestStoneType] = useState("");
  const [stoneSetting, setStoneSetting] = useState("");
  const [pearlSize, setPearlSize] = useState("");
  const [pearlType, setPearlType] = useState("");

  const [lengthExtender, setLengthExtender] = useState("");
  const [measurements, setMeasurements] = useState("");
  const [clasp, setClasp] = useState("");
  const [postLength, setPostLength] = useState("");
  const [pushBackSize, setPushBackSize] = useState("");
  const [thickness, setThickness] = useState("");

  const [gender, setGender] = useState("");
  const [tcw, setTcw] = useState("");
  const [totalCaratWeight, setTotalCaratWeight] = useState("");
  const [allSpecs, setAllSpecs] = useState("");

  const [variations, setVariations] = useState<Variation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateVariation<K extends keyof Variation>(idx: number, key: K, value: string) {
    setVariations((prev) => prev.map((v, i) => (i === idx ? { ...v, [key]: value } : v)));
  }

  function num(s: string): number | undefined {
    return s.trim() ? Number(s) : undefined;
  }
  function str(s: string): string | undefined {
    return s.trim() || undefined;
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
        plating: str(v.plating),
        upc: str(v.upc),
        msrp: num(v.msrp),
        totalWeight: num(v.totalWeight),
        silverWeight: num(v.silverWeight),
        mainStoneInfo: str(v.mainStoneInfo),
        mainStoneColor: str(v.mainStoneColor),
        mainStoneType: str(v.mainStoneType),
        restStoneInfo: str(v.restStoneInfo),
        restStoneColor: str(v.restStoneColor),
        restStoneType: str(v.restStoneType),
        stoneSetting: str(v.stoneSetting),
        pearlSize: str(v.pearlSize),
        pearlType: str(v.pearlType),
        lengthExtender: str(v.lengthExtender),
        measurements: str(v.measurements),
        clasp: str(v.clasp),
        postLength: str(v.postLength),
        pushBackSize: str(v.pushBackSize),
        thickness: str(v.thickness),
      }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          title: title.trim(),
          title2: str(title2),
          description: str(description),
          description2: str(description2),
          category: category.trim(),
          brand: str(brand),
          metal: str(metal),
          plating: str(plating),
          msrp: num(msrp),
          newMsrp: num(newMsrp),
          ruePrice: num(ruePrice),
          effectiveDate: effectiveDate || undefined,
          upc: str(upc),
          bulletFeatures: bulletFeatures.length ? bulletFeatures : undefined,
          variationSku: str(variationSku),
          variationTitle: str(variationTitle),
          variationDescription: str(variationDescription),
          totalWeight: num(totalWeight),
          silverWeight: num(silverWeight),
          mainStoneInfo: str(mainStoneInfo),
          mainStoneColor: str(mainStoneColor),
          mainStoneType: str(mainStoneType),
          restStoneInfo: str(restStoneInfo),
          restStoneColor: str(restStoneColor),
          restStoneType: str(restStoneType),
          stoneSetting: str(stoneSetting),
          pearlSize: str(pearlSize),
          pearlType: str(pearlType),
          lengthExtender: str(lengthExtender),
          measurements: str(measurements),
          clasp: str(clasp),
          postLength: str(postLength),
          pushBackSize: str(pushBackSize),
          thickness: str(thickness),
          gender: str(gender),
          tcw: str(tcw),
          totalCaratWeight: str(totalCaratWeight),
          allSpecs: str(allSpecs),
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-[860px]">
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
          <div className="flex gap-3.5 flex-wrap">
            <Field label="Title" width={"100%"}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
          </div>
          <Field label="Title #2 (optional)">
            <Input value={title2} onChange={(e) => setTitle2(e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={textareaClass} />
          </Field>
          <Field label="Description #2 (optional)">
            <textarea value={description2} onChange={(e) => setDescription2(e.target.value)} rows={2} className={textareaClass} />
          </Field>
          <Field label="Feature points (one per line, max 10)">
            <textarea value={bullets} onChange={(e) => setBullets(e.target.value)} rows={3} className={textareaClass} />
          </Field>
          <div className="flex gap-3.5 flex-wrap">
            <Field label="Metal" width={150}>
              <Input value={metal} onChange={(e) => setMetal(e.target.value)} placeholder="Silver" />
            </Field>
            <Field label="Plating" width={200}>
              <Input value={plating} onChange={(e) => setPlating(e.target.value)} />
            </Field>
            <Field label="UPC" width={150}>
              <Input value={upc} onChange={(e) => setUpc(e.target.value)} />
            </Field>
            <Field label="Gender" width={120}>
              <Input value={gender} onChange={(e) => setGender(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-[0.95rem] mb-3.5">Pricing</h2>
        <div className="flex gap-3.5 flex-wrap">
          <Field label="MSRP" width={110}>
            <Input type="number" step="0.01" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
          </Field>
          <Field label="New MSRP" width={110}>
            <Input type="number" step="0.01" value={newMsrp} onChange={(e) => setNewMsrp(e.target.value)} />
          </Field>
          <Field label="Rue Price" width={110}>
            <Input type="number" step="0.01" value={ruePrice} onChange={(e) => setRuePrice(e.target.value)} />
          </Field>
          <Field label="Effective date" width={160}>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Section title="Variation info" hint="from the Master File's variation SKU/title/description columns">
        <TextField label="Variation SKU" value={variationSku} onChange={setVariationSku} />
        <TextField label="Variation title" value={variationTitle} onChange={setVariationTitle} />
        <TextField label="Variation description" value={variationDescription} onChange={setVariationDescription} />
      </Section>

      <Section title="Weight & stones" hint="shared for the base row; each variation below can override">
        <TextField label="Total weight" value={totalWeight} onChange={setTotalWeight} />
        <TextField label="Silver weight" value={silverWeight} onChange={setSilverWeight} />
        <TextField label="Main stone info" value={mainStoneInfo} onChange={setMainStoneInfo} />
        <TextField label="Main stone color" value={mainStoneColor} onChange={setMainStoneColor} />
        <TextField label="Main stone type" value={mainStoneType} onChange={setMainStoneType} />
        <TextField label="Rest stone info" value={restStoneInfo} onChange={setRestStoneInfo} />
        <TextField label="Rest stone color" value={restStoneColor} onChange={setRestStoneColor} />
        <TextField label="Rest stone type" value={restStoneType} onChange={setRestStoneType} />
        <TextField label="Stone setting" value={stoneSetting} onChange={setStoneSetting} />
        <TextField label="Pearl size (mm)" value={pearlSize} onChange={setPearlSize} />
        <TextField label="Pearl type" value={pearlType} onChange={setPearlType} />
        <TextField label="TCW" value={tcw} onChange={setTcw} />
        <TextField label="Total carat weight" value={totalCaratWeight} onChange={setTotalCaratWeight} />
      </Section>

      <Section title="Measurements & findings" hint="length, clasp, chain thickness, etc.">
        <TextField label="Length + extender" value={lengthExtender} onChange={setLengthExtender} />
        <TextField label="Measurements" value={measurements} onChange={setMeasurements} />
        <TextField label="Clasp" value={clasp} onChange={setClasp} />
        <TextField label="Length of post" value={postLength} onChange={setPostLength} />
        <TextField label="Push back size" value={pushBackSize} onChange={setPushBackSize} />
        <TextField label="Thickness of chain" value={thickness} onChange={setThickness} />
        <TextField label="All specs" value={allSpecs} onChange={setAllSpecs} />
      </Section>

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
            None — just the base SKU. Add a row for each plating / stone / size variant (e.g. suffix{" "}
            <code className="font-mono">GP</code>, <code className="font-mono">RP</code>,{" "}
            <code className="font-mono">GP-6</code>). Any field left blank on a variation falls back to the
            shared value above.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {variations.map((v, i) => (
              <div key={i} className="p-3.5 rounded-sm bg-surface-sunken">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[0.85rem] font-semibold text-ink">
                    {sku || "SKU"}-{v.suffix || "…"}
                  </span>
                  <Button size="sm" variant="danger" onClick={() => setVariations((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 size={13} />
                  </Button>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                  <TextField label="Suffix" value={v.suffix} onChange={(x) => updateVariation(i, "suffix", x)} />
                  <TextField label="Plating" value={v.plating} onChange={(x) => updateVariation(i, "plating", x)} />
                  <TextField label="UPC" value={v.upc} onChange={(x) => updateVariation(i, "upc", x)} />
                  <TextField label="MSRP" value={v.msrp} onChange={(x) => updateVariation(i, "msrp", x)} />
                  <TextField label="Total weight" value={v.totalWeight} onChange={(x) => updateVariation(i, "totalWeight", x)} />
                  <TextField label="Silver weight" value={v.silverWeight} onChange={(x) => updateVariation(i, "silverWeight", x)} />
                  <TextField label="Main stone info" value={v.mainStoneInfo} onChange={(x) => updateVariation(i, "mainStoneInfo", x)} />
                  <TextField label="Main stone color" value={v.mainStoneColor} onChange={(x) => updateVariation(i, "mainStoneColor", x)} />
                  <TextField label="Main stone type" value={v.mainStoneType} onChange={(x) => updateVariation(i, "mainStoneType", x)} />
                  <TextField label="Rest stone info" value={v.restStoneInfo} onChange={(x) => updateVariation(i, "restStoneInfo", x)} />
                  <TextField label="Rest stone color" value={v.restStoneColor} onChange={(x) => updateVariation(i, "restStoneColor", x)} />
                  <TextField label="Rest stone type" value={v.restStoneType} onChange={(x) => updateVariation(i, "restStoneType", x)} />
                  <TextField label="Stone setting" value={v.stoneSetting} onChange={(x) => updateVariation(i, "stoneSetting", x)} />
                  <TextField label="Pearl size" value={v.pearlSize} onChange={(x) => updateVariation(i, "pearlSize", x)} />
                  <TextField label="Pearl type" value={v.pearlType} onChange={(x) => updateVariation(i, "pearlType", x)} />
                  <TextField label="Length + extender" value={v.lengthExtender} onChange={(x) => updateVariation(i, "lengthExtender", x)} />
                  <TextField label="Measurements" value={v.measurements} onChange={(x) => updateVariation(i, "measurements", x)} />
                  <TextField label="Clasp" value={v.clasp} onChange={(x) => updateVariation(i, "clasp", x)} />
                  <TextField label="Length of post" value={v.postLength} onChange={(x) => updateVariation(i, "postLength", x)} />
                  <TextField label="Push back size" value={v.pushBackSize} onChange={(x) => updateVariation(i, "pushBackSize", x)} />
                  <TextField label="Thickness" value={v.thickness} onChange={(x) => updateVariation(i, "thickness", x)} />
                </div>
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
