"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Check, Package, Gem } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BulletFeaturesEditor, BULLET_FEATURES_MIN_VISIBLE } from "@/components/ui/BulletFeaturesEditor";
import { CATEGORY_OPTIONS, GENDER_OPTIONS, BRAND_OPTIONS, METAL_OPTIONS, PLATING_OPTIONS } from "@/lib/itemPicklists";
import { MeasurementFieldsEditor } from "@/components/ui/MeasurementFieldsEditor";
import type { ItemMeasurements } from "@/lib/measurements/types";
import { validateItemMeasurements, formatValidationIssues, cleanMeasurementsForSave } from "@/lib/measurements/validate";

export type ItemEditValues = {
  vendorName: string;
  vendorSku: string;
  itemNumber: string;
  sampleSku: string;
  category: string;
  brand: string;
  upc: string;
  upc2: string;
  aliasSku: string;
  collectionName: string;
  season: string;
  boxNumber: string;

  title: string;
  title2: string;
  description: string;
  description2: string;

  metal: string;
  plating: string;
  gender: string;
  clasp: string;
  tcw: string;
  birthstone: string;
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
  totalCaratWeight: string;

  allSpecs: string;
};

const textareaClass =
  "font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)] resize-y";

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${textareaClass} ${props.className ?? ""}`} />;
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-brass shrink-0 flex items-center">{icon}</span>
      <h2 className="text-[0.92rem] font-semibold m-0">{title}</h2>
      {hint && <span className="text-[0.78rem] text-ink-faint">({hint})</span>}
    </div>
  );
}

// specs.* keys, mapped from the flat form-value keys above. Anything not
// listed here is a top-level Item field handled separately in handleSave.
const SPECS_FIELDS: (keyof ItemEditValues)[] = [
  "metal",
  "plating",
  "gender",
  "clasp",
  "tcw",
  "birthstone",
  "mainStoneInfo",
  "mainStoneColor",
  "mainStoneType",
  "restStoneInfo",
  "restStoneColor",
  "restStoneType",
  "stoneSetting",
  "pearlSize",
  "pearlType",
  "totalCaratWeight",
  "allSpecs",
];

export function ItemEditForm({
  itemId,
  initial,
  initialBulletFeatures,
  initialMeasurements,
}: {
  itemId: string;
  initial: ItemEditValues;
  initialBulletFeatures: string[];
  initialMeasurements: ItemMeasurements;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ItemEditValues>(initial);
  const [bulletFeatures, setBulletFeatures] = useState<string[]>(initialBulletFeatures);
  const [bulletFeaturesBoxCount, setBulletFeaturesBoxCount] = useState(
    Math.max(initialBulletFeatures.length, BULLET_FEATURES_MIN_VISIBLE)
  );
  const [itemMeasurements, setItemMeasurements] = useState<ItemMeasurements>(initialMeasurements);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ItemEditValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const measurementCheck = validateItemMeasurements(itemMeasurements, values.category);
    if (!measurementCheck.valid) {
      setError(formatValidationIssues(measurementCheck.issues));
      return;
    }

    setSaving(true);

    const specs: Record<string, string> = {};
    for (const key of SPECS_FIELDS) {
      const v = values[key].trim();
      if (v) specs[key] = v;
    }
    // weight is a nested object ({ totalG, silverG }), not a flat primitive
    // — ItemSpecsSchema only accepts flat values, so it can't go in `specs`
    // above and is sent as its own follow-up PATCH after the main save.
    const weight: { totalG?: number; silverG?: number } = {};
    if (values.totalWeight.trim()) weight.totalG = Number(values.totalWeight);
    if (values.silverWeight.trim()) weight.silverG = Number(values.silverWeight);

    const cleanBulletFeatures = bulletFeatures.map((b) => b.trim()).filter(Boolean).slice(0, 10);

    const body: Record<string, unknown> = {
      vendorSku: values.vendorSku,
      itemNumber: values.itemNumber || undefined,
      category: values.category || undefined,
      brand: values.brand,
      upc: values.upc,
      upc2: values.upc2,
      aliasSku: values.aliasSku,
      collectionName: values.collectionName,
      season: values.season,
      boxNumber: values.boxNumber,
      title: values.title,
      title2: values.title2,
      description: values.description,
      description2: values.description2,
      bulletFeatures: cleanBulletFeatures,
      specs: Object.keys(specs).length > 0 ? specs : undefined,
      measurements: cleanMeasurementsForSave(itemMeasurements),
    };

    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save changes");
        return;
      }

      // Weight lives at specs.weight.{totalG,silverG} — a nested shape the
      // open ItemSpecsSchema (flat primitives only) can't carry, so it's
      // sent as its own follow-up PATCH using the same Object.assign(specs)
      // merge the route already does for every other specs.* write.
      if (Object.keys(weight).length > 0) {
        await fetch(`/api/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specs: { weight } }),
        }).catch(() => null);
      }

      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-[900px]">
      <Card>
        <SectionHeader icon={<Package size={16} />} title="Identity" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Vendor">
            <Input value={values.vendorName} disabled placeholder="—" />
          </Field>
          <Field label="Vendor SKU">
            <Input value={values.vendorSku} onChange={(e) => set("vendorSku", e.target.value)} />
          </Field>
          <Field label="Permanent item #">
            <Input value={values.itemNumber} onChange={(e) => set("itemNumber", e.target.value)} />
          </Field>
          <Field label="Sample SKU">
            <Input value={values.sampleSku} disabled placeholder="—" />
          </Field>
          <Field label="Category">
            <Select value={values.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Select category…</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={values.brand} onChange={(e) => set("brand", e.target.value)}>
              <option value="">Select brand…</option>
              {BRAND_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="UPC">
            <Input value={values.upc} onChange={(e) => set("upc", e.target.value)} />
          </Field>
          <Field label="2nd UPC">
            <Input value={values.upc2} onChange={(e) => set("upc2", e.target.value)} />
          </Field>
          <Field label="Alias SKU">
            <Input value={values.aliasSku} onChange={(e) => set("aliasSku", e.target.value)} />
          </Field>
          <Field label="Collection">
            <Input value={values.collectionName} onChange={(e) => set("collectionName", e.target.value)} />
          </Field>
          <Field label="Season">
            <Input value={values.season} onChange={(e) => set("season", e.target.value)} />
          </Field>
          <Field label="Box number">
            <Input value={values.boxNumber} onChange={(e) => set("boxNumber", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Package size={16} />} title="Listing copy" />
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Title #2 (optional)">
            <Input value={values.title2} onChange={(e) => set("title2", e.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={4} value={values.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Description #2 (optional)">
            <TextArea rows={3} value={values.description2} onChange={(e) => set("description2", e.target.value)} />
          </Field>
          <div>
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide block mb-2">
              Feature points (first 3 required, up to 10)
            </span>
            <BulletFeaturesEditor
              values={bulletFeatures}
              boxCount={bulletFeaturesBoxCount}
              onChange={(next) => {
                setBulletFeatures(next);
                setSaved(false);
              }}
              onBoxCountChange={setBulletFeaturesBoxCount}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Gem size={16} />} title="Weight & stones" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Metal">
            <Select value={values.metal} onChange={(e) => set("metal", e.target.value)}>
              <option value="">Select metal…</option>
              {METAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plating">
            <Select value={values.plating} onChange={(e) => set("plating", e.target.value)}>
              <option value="">Select plating…</option>
              {PLATING_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gender">
            <Select value={values.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Select gender…</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Total weight">
            <Input type="number" step="0.01" value={values.totalWeight} onChange={(e) => set("totalWeight", e.target.value)} />
          </Field>
          <Field label="Silver weight">
            <Input type="number" step="0.01" value={values.silverWeight} onChange={(e) => set("silverWeight", e.target.value)} />
          </Field>
          <Field label="TCW">
            <Input value={values.tcw} onChange={(e) => set("tcw", e.target.value)} />
          </Field>
          <Field label="Total carat weight">
            <Input value={values.totalCaratWeight} onChange={(e) => set("totalCaratWeight", e.target.value)} />
          </Field>
          <Field label="Birthstone">
            <Input value={values.birthstone} onChange={(e) => set("birthstone", e.target.value)} />
          </Field>
          <Field label="Main stone info">
            <Input value={values.mainStoneInfo} onChange={(e) => set("mainStoneInfo", e.target.value)} />
          </Field>
          <Field label="Main stone color">
            <Input value={values.mainStoneColor} onChange={(e) => set("mainStoneColor", e.target.value)} />
          </Field>
          <Field label="Main stone type">
            <Input value={values.mainStoneType} onChange={(e) => set("mainStoneType", e.target.value)} />
          </Field>
          <Field label="Rest stone info">
            <Input value={values.restStoneInfo} onChange={(e) => set("restStoneInfo", e.target.value)} />
          </Field>
          <Field label="Rest stone color">
            <Input value={values.restStoneColor} onChange={(e) => set("restStoneColor", e.target.value)} />
          </Field>
          <Field label="Rest stone type">
            <Input value={values.restStoneType} onChange={(e) => set("restStoneType", e.target.value)} />
          </Field>
          <Field label="Stone setting">
            <Input value={values.stoneSetting} onChange={(e) => set("stoneSetting", e.target.value)} />
          </Field>
          <Field label="Pearl size">
            <Input value={values.pearlSize} onChange={(e) => set("pearlSize", e.target.value)} />
          </Field>
          <Field label="Pearl type">
            <Input value={values.pearlType} onChange={(e) => set("pearlType", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Package size={16} />} title="Findings & specs" hint="clasp, misc. spec text" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Clasp">
            <Input value={values.clasp} onChange={(e) => set("clasp", e.target.value)} />
          </Field>
          <Field label="All specs" width="100%">
            <Input value={values.allSpecs} onChange={(e) => set("allSpecs", e.target.value)} />
          </Field>
        </div>
      </Card>

      {values.category.trim() && (
        <MeasurementFieldsEditor
          category={values.category}
          value={itemMeasurements}
          onChange={setItemMeasurements}
        />
      )}

      <div className="flex items-center gap-3 sticky bottom-4 z-10">
        <Card padding={0} className="flex items-center gap-3 px-4 py-3 shadow-lg">
          <Button type="submit" variant="primary" disabled={saving}>
            <span className="flex items-center gap-1.5">
              <Save size={14} /> {saving ? "Saving…" : "Save changes"}
            </span>
          </Button>
          {saved && !saving && (
            <span className="flex items-center gap-1 text-[0.83rem] text-good">
              <Check size={14} /> Saved
            </span>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      </div>
    </form>
  );
}
