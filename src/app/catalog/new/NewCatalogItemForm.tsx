"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, DollarSign, Gem, Ruler, Save, Megaphone, Sparkles, Layers, Check } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DESCRIPTION_PLATFORMS, type DescriptionPlatform } from "@/lib/enums";
import { DESCRIPTION_PLATFORM_LABEL } from "@/lib/statusDisplay";
import { BulletFeaturesEditor, BULLET_FEATURES_MIN_VISIBLE } from "@/components/ui/BulletFeaturesEditor";
import { CATEGORY_OPTIONS, GENDER_OPTIONS, BRAND_OPTIONS, METAL_OPTIONS, PLATING_OPTIONS } from "@/lib/itemPicklists";
import { MeasurementFieldsEditor } from "@/components/ui/MeasurementFieldsEditor";
import type { ItemMeasurements } from "@/lib/measurements/types";
import { validateItemMeasurements, formatValidationIssues, cleanMeasurementsForSave } from "@/lib/measurements/validate";
import { VariationsStep } from "./VariationsStep";
import { type VariationDraft, emptyVariationDraft, draftToPayload } from "@/lib/catalog/variationDraft";

const textareaClass =
  "font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)] resize-y";

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${textareaClass} ${props.className ?? ""}`} />;
}

// Matches the header style used on the item detail/edit screens (icon +
// title + optional hint) so all three "item" screens read as one system.
function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-brass shrink-0 flex items-center">{icon}</span>
      <h2 className="text-[0.92rem] font-semibold m-0">{title}</h2>
      {hint && <span className="text-[0.78rem] text-ink-faint">— {hint}</span>}
    </div>
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
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
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
  const [upc2, setUpc2] = useState("");
  const [aliasSku, setAliasSku] = useState("");
  const [bulletFeatures, setBulletFeatures] = useState<string[]>([]);
  const [bulletFeaturesBoxCount, setBulletFeaturesBoxCount] = useState(BULLET_FEATURES_MIN_VISIBLE);

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

  const [clasp, setClasp] = useState("");

  const [gender, setGender] = useState("");
  const [tcw, setTcw] = useState("");
  const [totalCaratWeight, setTotalCaratWeight] = useState("");
  const [allSpecs, setAllSpecs] = useState("");

  const [itemMeasurements, setItemMeasurements] = useState<ItemMeasurements>({});

  const [marketplaceDescriptions, setMarketplaceDescriptions] = useState<Record<DescriptionPlatform, string>>(
    () => Object.fromEntries(DESCRIPTION_PLATFORMS.map((p) => [p, ""])) as Record<DescriptionPlatform, string>
  );

  // Whether this product has variations — null means "not decided yet",
  // which keeps the confirm prompt showing until the user picks one way
  // or the other, rather than defaulting silently to "no."
  const [hasVariations, setHasVariations] = useState<boolean | null>(null);
  const [step, setStep] = useState<"product" | "variations">("product");
  const [variations, setVariations] = useState<VariationDraft[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function num(s: string): number | undefined {
    return s.trim() ? Number(s) : undefined;
  }
  function str(s: string): string | undefined {
    return s.trim() || undefined;
  }

  function validateProductStep(): string | null {
    if (!sku.trim() || !title.trim() || !category.trim()) {
      return "SKU, title and category are required.";
    }
    if (sku.includes("-")) {
      return "The main SKU shouldn't contain a hyphen — variations get their SKU from the confirmation step next.";
    }
    if (bulletFeatures.slice(0, 3).some((b) => !b.trim())) {
      return "The first 3 feature points are required.";
    }
    const measurementCheck = validateItemMeasurements(itemMeasurements, category);
    if (!measurementCheck.valid) {
      return formatValidationIssues(measurementCheck.issues);
    }
    return null;
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validationError = validateProductStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (hasVariations === null) {
      setError("Choose whether this item has variations before continuing.");
      return;
    }
    if (hasVariations) {
      if (variations.length === 0) setVariations([emptyVariationDraft(itemMeasurements)]);
      setStep("variations");
      return;
    }
    void submit([]);
  }

  async function submit(variationDrafts: VariationDraft[]) {
    setError(null);

    const validationError = validateProductStep();
    if (validationError) {
      setError(validationError);
      setStep("product");
      return;
    }

    const payloadVariations = variationDrafts
      .map((v) => draftToPayload(v, itemMeasurements))
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const cleanBulletFeatures = bulletFeatures.map((b) => b.trim()).filter(Boolean).slice(0, 10);

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
          upc2: str(upc2),
          aliasSku: str(aliasSku),
          bulletFeatures: cleanBulletFeatures.length ? cleanBulletFeatures : undefined,
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
          clasp: str(clasp),
          measurements: cleanMeasurementsForSave(itemMeasurements),
          gender: str(gender),
          tcw: str(tcw),
          totalCaratWeight: str(totalCaratWeight),
          allSpecs: str(allSpecs),
          marketplaceDescriptions: (() => {
            const entries = Object.entries(marketplaceDescriptions).filter(([, text]) => text.trim());
            return entries.length > 0 ? Object.fromEntries(entries) : undefined;
          })(),
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

  if (step === "variations") {
    return (
      <VariationsStep
        base={{
          sku: sku.trim(),
          title: title.trim(),
          description,
          category,
          brand,
          gender,
          metal,
          plating,
          msrp,
          measurements: itemMeasurements,
        }}
        variations={variations}
        onChange={setVariations}
        onBack={() => setStep("product")}
        onSubmit={() => void submit(variations)}
        submitting={submitting}
        error={error}
      />
    );
  }

  return (
    <form onSubmit={handleContinue} className="flex flex-col gap-6 max-w-[960px]">
      <Card>
        <SectionHeader icon={<Package size={16} />} title="Product" />
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Base SKU">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="A1234" required />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="">Select category…</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Select brand…</option>
                {BRAND_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Title #2 (optional)">
            <Input value={title2} onChange={(e) => setTitle2(e.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Description #2 (optional)">
            <TextArea rows={2} value={description2} onChange={(e) => setDescription2(e.target.value)} />
          </Field>
          <div>
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide block mb-2">
              Feature points — first 3 required, up to 10
            </span>
            <BulletFeaturesEditor
              values={bulletFeatures}
              boxCount={bulletFeaturesBoxCount}
              onChange={setBulletFeatures}
              onBoxCountChange={setBulletFeaturesBoxCount}
            />
          </div>

          <div className="pt-1 border-t border-border" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Metal">
              <Select value={metal} onChange={(e) => setMetal(e.target.value)}>
                <option value="">Select metal…</option>
                {METAL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Plating">
              <Select value={plating} onChange={(e) => setPlating(e.target.value)}>
                <option value="">Select plating…</option>
                {PLATING_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gender">
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select gender…</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="UPC">
              <Input value={upc} onChange={(e) => setUpc(e.target.value)} />
            </Field>
            <Field label="2nd UPC">
              <Input value={upc2} onChange={(e) => setUpc2(e.target.value)} />
            </Field>
            <Field label="Alias SKU">
              <Input value={aliasSku} onChange={(e) => setAliasSku(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Megaphone size={16} />} title="Marketplace descriptions" />
        <p className="text-ink-soft text-[0.83rem] -mt-2 mb-4">
          Per-marketplace copy — falls back to the general description above until a platform gets its
          own. AI-assisted drafting from the title/description is planned; for now these are entered by
          hand.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {DESCRIPTION_PLATFORMS.map((platform) => (
            <Field key={platform} label={DESCRIPTION_PLATFORM_LABEL[platform]}>
              <TextArea
                rows={4}
                value={marketplaceDescriptions[platform]}
                onChange={(e) =>
                  setMarketplaceDescriptions((prev) => ({ ...prev, [platform]: e.target.value }))
                }
                placeholder={description || "No general description set yet."}
              />
            </Field>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-ink-faint text-[0.76rem] mt-4 mb-0">
          <Sparkles size={12} /> AI-generated drafts from title/description are coming soon.
        </p>
      </Card>

      <Card>
        <SectionHeader icon={<DollarSign size={16} />} title="Pricing" hint="shared across every variation" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="MSRP">
            <Input type="number" step="0.01" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
          </Field>
          <Field label="New MSRP">
            <Input type="number" step="0.01" value={newMsrp} onChange={(e) => setNewMsrp(e.target.value)} />
          </Field>
          <Field label="Rue Price">
            <Input type="number" step="0.01" value={ruePrice} onChange={(e) => setRuePrice(e.target.value)} />
          </Field>
          <Field label="Effective date">
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader
          icon={<Gem size={16} />}
          title="Weight & stones"
          hint="shared for the base row; variations can override in the next step"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextField label="Total weight" value={totalWeight} onChange={setTotalWeight} />
          <TextField label="Silver weight" value={silverWeight} onChange={setSilverWeight} />
          <TextField label="TCW" value={tcw} onChange={setTcw} />
          <TextField label="Total carat weight" value={totalCaratWeight} onChange={setTotalCaratWeight} />
          <TextField label="Main stone info" value={mainStoneInfo} onChange={setMainStoneInfo} />
          <TextField label="Main stone color" value={mainStoneColor} onChange={setMainStoneColor} />
          <TextField label="Main stone type" value={mainStoneType} onChange={setMainStoneType} />
          <TextField label="Rest stone info" value={restStoneInfo} onChange={setRestStoneInfo} />
          <TextField label="Rest stone color" value={restStoneColor} onChange={setRestStoneColor} />
          <TextField label="Rest stone type" value={restStoneType} onChange={setRestStoneType} />
          <TextField label="Stone setting" value={stoneSetting} onChange={setStoneSetting} />
          <TextField label="Pearl size (mm)" value={pearlSize} onChange={setPearlSize} />
          <TextField label="Pearl type" value={pearlType} onChange={setPearlType} />
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Ruler size={16} />} title="Findings & specs" hint="clasp, misc. spec text" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextField label="Clasp" value={clasp} onChange={setClasp} />
          <Field label="All specs" width="100%">
            <Input value={allSpecs} onChange={(e) => setAllSpecs(e.target.value)} />
          </Field>
        </div>
      </Card>

      {category.trim() && (
        <MeasurementFieldsEditor
          category={category}
          value={itemMeasurements}
          onChange={setItemMeasurements}
        />
      )}

      <Card>
        <SectionHeader icon={<Layers size={16} />} title="Variations" />
        <p className="text-ink-soft text-[0.85rem] mb-4">
          Does this item come in multiple platings, stone colors, or sizes — each needing its own SKU?
          Category, brand, gender, metal, and MSRP always stay the same across every variation; title,
          description, and stone/plating details can differ.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setHasVariations(true)}
            className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-md border text-left transition-colors duration-150 cursor-pointer ${
              hasVariations === true
                ? "border-brass bg-brass-bg text-ink"
                : "border-border-strong bg-surface text-ink-soft hover:border-brass"
            }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 ${
                hasVariations === true ? "border-brass bg-brass" : "border-border-strong"
              }`}
            >
              {hasVariations === true && <Check size={12} className="text-on-brass" />}
            </span>
            <span>
              <span className="block font-semibold text-[0.87rem]">Yes, it has variations</span>
              <span className="block text-[0.78rem] text-ink-faint">
                Continue to the Variations screen after this step
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setHasVariations(false)}
            className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-md border text-left transition-colors duration-150 cursor-pointer ${
              hasVariations === false
                ? "border-brass bg-brass-bg text-ink"
                : "border-border-strong bg-surface text-ink-soft hover:border-brass"
            }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 ${
                hasVariations === false ? "border-brass bg-brass" : "border-border-strong"
              }`}
            >
              {hasVariations === false && <Check size={12} className="text-on-brass" />}
            </span>
            <span>
              <span className="block font-semibold text-[0.87rem]">No, just this one SKU</span>
              <span className="block text-[0.78rem] text-ink-faint">Create the item as-is</span>
            </span>
          </button>
        </div>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-4 z-10">
        <Card padding={0} className="flex items-center gap-3 px-4 py-3 shadow-lg flex-wrap">
          <Button type="submit" variant="primary" disabled={submitting}>
            <span className="flex items-center gap-1.5">
              <Save size={14} />
              {submitting
                ? "Creating…"
                : hasVariations
                  ? "Continue to variations"
                  : "Create item"}
            </span>
          </Button>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      </div>
    </form>
  );
}
