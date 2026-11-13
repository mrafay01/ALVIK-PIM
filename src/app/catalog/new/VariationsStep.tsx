"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Lock,
  AlertTriangle,
  Link2,
  Unlink,
  Save,
  Package,
  Ruler,
  RotateCcw,
} from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { PLATING_OPTIONS } from "@/lib/itemPicklists";
import {
  type VariationDraft,
  type VariationBaseContext,
  emptyVariationDraft,
  resolvedVariationSku,
  measurementsDifferFromBase,
  structuredCloneMeasurements,
} from "@/lib/catalog/variationDraft";
import { MeasurementFieldsEditor } from "@/components/ui/MeasurementFieldsEditor";

const textareaClass =
  "font-body text-[0.86rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)] resize-y";

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </Field>
  );
}

// A read-only chip showing a value that's always inherited from the base
// item and can never be overridden per variation (category/brand/gender/
// metal/MSRP) — makes the "always same" rule visible rather than just
// silently absent from the form, per the feature request.
function InheritedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide flex items-center gap-1">
        <Lock size={10} /> {label}
      </span>
      <div className="font-body text-[0.86rem] px-3 py-2.5 rounded-sm border border-dashed border-border-strong bg-surface-sunken/50 text-ink-faint">
        {value || "—"}
      </div>
    </div>
  );
}

export function VariationsStep({
  base,
  variations,
  onChange,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  base: VariationBaseContext;
  variations: VariationDraft[];
  onChange: (next: VariationDraft[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(variations.length > 0 ? 0 : null);

  function updateRow(idx: number, patch: Partial<VariationDraft>) {
    onChange(variations.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  function addRow() {
    const next = [...variations, emptyVariationDraft(base.measurements)];
    onChange(next);
    setExpandedRow(next.length - 1);
  }

  function removeRow(idx: number) {
    onChange(variations.filter((_, i) => i !== idx));
    setExpandedRow(null);
  }

  // Client-side duplicate-suffix / duplicate-resolved-SKU check — the
  // server re-checks against the live DB too, but catching an obvious
  // in-form collision before submit is a better experience than a round
  // trip just to find out "SKU already exists."
  // Same rule as the server: capitals ignored (SharePoint folders don't
  // tell "A1234" from "a1234"), and a variation can't reuse the main SKU.
  const resolvedSkus = variations.map((v) => resolvedVariationSku(base.sku, v));
  const lowered = [base.sku.trim().toLowerCase(), ...resolvedSkus.map((s) => (s ?? "").toLowerCase())];
  const duplicateSkus = new Set(
    resolvedSkus.filter((sku, i) => sku && lowered.indexOf(sku.toLowerCase()) !== i + 1)
  );

  const filledCount = variations.filter((v) => v.suffix.trim()).length;

  return (
    <div className="flex flex-col gap-6 max-w-[1040px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-ink-faint bg-transparent border-none p-0 cursor-pointer hover:text-brass transition-colors duration-150"
        >
          <ArrowLeft size={14} /> Back to product details
        </button>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-md bg-brass-bg text-brass shrink-0">
            <Package size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink m-0 mb-1">Variations</h1>
            <p className="text-[0.85rem] text-ink-soft m-0">
              Building variations for <span className="font-mono font-semibold text-ink">{base.sku || "—"}</span>
              {base.title && <> ({base.title})</>}. Category, brand, gender, metal, and MSRP are locked to the
              base item&apos;s values on every variation; title, description, plating, and stone details can
              differ per row.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <InheritedField label="Category" value={base.category} />
          <InheritedField label="Brand" value={base.brand} />
          <InheritedField label="Gender" value={base.gender} />
          <InheritedField label="Metal" value={base.metal} />
          <InheritedField label="MSRP" value={base.msrp ? `$${base.msrp}` : ""} />
        </div>
      </Card>

      <Card padding={0}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[0.92rem] font-semibold m-0">
              {filledCount === 0 ? "No variations yet" : `${filledCount} variation${filledCount === 1 ? "" : "s"}`}
            </h2>
            {duplicateSkus.size > 0 && (
              <Pill tone="critical" dot>
                Duplicate SKU
              </Pill>
            )}
          </div>
          <Button type="button" size="sm" onClick={addRow}>
            <span className="flex items-center gap-1.5">
              <Plus size={13} /> Add variation
            </span>
          </Button>
        </div>

        {variations.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-ink-faint text-[0.87rem] m-0 mb-3">
              Add a row for each plating / stone / size variant of this product, e.g. suffix{" "}
              <code className="font-mono">GP</code>, <code className="font-mono">RP</code>,{" "}
              <code className="font-mono">GP-6</code>.
            </p>
            <Button type="button" onClick={addRow}>
              <span className="flex items-center gap-1.5">
                <Plus size={14} /> Add first variation
              </span>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {variations.map((v, i) => {
              const resolvedSku = resolvedVariationSku(base.sku, v);
              const isDuplicate = duplicateSkus.has(resolvedSku);
              const isExpanded = expandedRow === i;
              const isIndependent = !!v.independentSku.trim();
              const rowIncomplete = !v.suffix.trim();

              return (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-transparent border-none cursor-pointer text-left hover:bg-surface-sunken transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[0.88rem] font-semibold text-ink shrink-0">
                        {resolvedSku}
                      </span>
                      {isIndependent && (
                        <span className="flex items-center gap-1 text-[0.72rem] text-warn shrink-0">
                          <Unlink size={11} /> independent SKU
                        </span>
                      )}
                      {v.plating && (
                        <span className="text-[0.8rem] text-ink-soft truncate">{v.plating}</span>
                      )}
                      {rowIncomplete && (
                        <span className="flex items-center gap-1 text-[0.72rem] text-warn shrink-0">
                          <AlertTriangle size={11} /> needs a suffix
                        </span>
                      )}
                      {isDuplicate && !rowIncomplete && (
                        <span className="flex items-center gap-1 text-[0.72rem] text-critical shrink-0">
                          <AlertTriangle size={11} /> duplicate SKU
                        </span>
                      )}
                    </div>
                    <span className="text-ink-faint text-[0.78rem] shrink-0">
                      {isExpanded ? "Collapse" : "Edit"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
                        <TextField
                          label="Suffix *"
                          value={v.suffix}
                          onChange={(x) => updateRow(i, { suffix: x })}
                          placeholder="GP"
                        />
                        <Field label="Plating">
                          <Select value={v.plating} onChange={(e) => updateRow(i, { plating: e.target.value })}>
                            <option value="">Use base plating</option>
                            {PLATING_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <TextField label="UPC" value={v.upc} onChange={(x) => updateRow(i, { upc: x })} />
                        <TextField label="2nd UPC" value={v.upc2} onChange={(x) => updateRow(i, { upc2: x })} />
                      </div>

                      <div className="mb-4 p-3.5 rounded-md bg-surface-sunken border border-border">
                        <label className="flex items-center gap-2 text-[0.82rem] text-ink cursor-pointer select-none mb-2">
                          <input
                            type="checkbox"
                            checked={isIndependent}
                            onChange={(e) =>
                              updateRow(i, { independentSku: e.target.checked ? v.independentSku || " " : "" })
                            }
                            className="w-4 h-4 accent-[var(--brass)]"
                          />
                          <Link2 size={13} className="text-ink-faint" />
                          This variation uses a different SKU family (not {base.sku || "the base SKU"}-{v.suffix || "…"})
                        </label>
                        {isIndependent && (
                          <>
                            <Input
                              value={v.independentSku.trim()}
                              onChange={(e) => updateRow(i, { independentSku: e.target.value })}
                              placeholder="e.g. B5678"
                              className="max-w-[240px]"
                            />
                            <p className="text-[0.76rem] text-warn mt-2 mb-0 flex items-center gap-1.5">
                              <AlertTriangle size={12} /> This breaks the automatic {base.sku || "base"}-
                              {v.suffix || "suffix"} SKU pattern. The two items stay linked as a family
                              internally, but the SKU itself won&apos;t show the relationship.
                            </p>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
                        <Field label="Title override (optional)">
                          <Input
                            value={v.title}
                            onChange={(e) => updateRow(i, { title: e.target.value })}
                            placeholder={base.title || "Uses base title"}
                          />
                        </Field>
                        <Field label="Alias SKU">
                          <Input value={v.aliasSku} onChange={(e) => updateRow(i, { aliasSku: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Description override (optional)">
                        <textarea
                          rows={2}
                          value={v.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          placeholder={base.description || "Uses base description"}
                          className={textareaClass}
                        />
                      </Field>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mt-4 pt-4 border-t border-border">
                        <InheritedField label="Category" value={base.category} />
                        <InheritedField label="Brand" value={base.brand} />
                        <InheritedField label="Gender" value={base.gender} />
                        <InheritedField label="Metal" value={base.metal} />
                        <InheritedField label="MSRP" value={base.msrp ? `$${base.msrp}` : ""} />
                      </div>

                      {base.category && (
                        <VariationMeasurements
                          category={base.category}
                          baseMeasurements={base.measurements}
                          value={v.measurements}
                          onChange={(next) => updateRow(i, { measurements: next })}
                        />
                      )}

                      <details className="mt-4">
                        <summary className="cursor-pointer text-[0.8rem] font-semibold text-ink-faint hover:text-ink transition-colors duration-150">
                          Weight & stone overrides
                        </summary>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-3.5">
                          <TextField label="Total weight" value={v.totalWeight} onChange={(x) => updateRow(i, { totalWeight: x })} />
                          <TextField label="Silver weight" value={v.silverWeight} onChange={(x) => updateRow(i, { silverWeight: x })} />
                          <TextField label="Main stone info" value={v.mainStoneInfo} onChange={(x) => updateRow(i, { mainStoneInfo: x })} />
                          <TextField label="Main stone color" value={v.mainStoneColor} onChange={(x) => updateRow(i, { mainStoneColor: x })} />
                          <TextField label="Main stone type" value={v.mainStoneType} onChange={(x) => updateRow(i, { mainStoneType: x })} />
                          <TextField label="Rest stone info" value={v.restStoneInfo} onChange={(x) => updateRow(i, { restStoneInfo: x })} />
                          <TextField label="Rest stone color" value={v.restStoneColor} onChange={(x) => updateRow(i, { restStoneColor: x })} />
                          <TextField label="Rest stone type" value={v.restStoneType} onChange={(x) => updateRow(i, { restStoneType: x })} />
                          <TextField label="Stone setting" value={v.stoneSetting} onChange={(x) => updateRow(i, { stoneSetting: x })} />
                          <TextField label="Pearl size" value={v.pearlSize} onChange={(x) => updateRow(i, { pearlSize: x })} />
                          <TextField label="Pearl type" value={v.pearlType} onChange={(x) => updateRow(i, { pearlType: x })} />
                          <TextField label="Clasp" value={v.clasp} onChange={(x) => updateRow(i, { clasp: x })} />
                        </div>
                      </details>

                      <div className="flex justify-end mt-4 pt-4 border-t border-border">
                        <Button type="button" size="sm" variant="danger" onClick={() => removeRow(i)}>
                          <span className="flex items-center gap-1.5">
                            <Trash2 size={13} /> Remove this variation
                          </span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3 sticky bottom-4 z-10">
        <Card padding={0} className="flex items-center gap-3 px-4 py-3 shadow-lg flex-wrap">
          <Button
            type="button"
            variant="primary"
            disabled={submitting || duplicateSkus.size > 0}
            onClick={onSubmit}
          >
            <span className="flex items-center gap-1.5">
              <Save size={14} />
              {submitting ? "Creating…" : `Create ${1 + filledCount} item${filledCount ? "s" : ""}`}
            </span>
          </Button>
          {duplicateSkus.size > 0 && (
            <span className="text-critical text-[0.82rem]">Resolve duplicate SKUs before continuing.</span>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      </div>
    </div>
  );
}

// A variation's measurements start as a copy of the base item's and can be
// edited independently from there (a ring-size or dimension can genuinely
// differ between plating/size variants even though the base product is
// the same) — see the feature request this implements. Collapsed by
// default when the row's measurements still match the base exactly, open
// when they've diverged, so an untouched row doesn't visually claim to
// have a custom set of measurements.
function VariationMeasurements({
  category,
  baseMeasurements,
  value,
  onChange,
}: {
  category: string;
  baseMeasurements: ReturnType<typeof structuredCloneMeasurements>;
  value: ReturnType<typeof structuredCloneMeasurements>;
  onChange: (next: ReturnType<typeof structuredCloneMeasurements>) => void;
}) {
  const differs = measurementsDifferFromBase(value, baseMeasurements);
  const [open, setOpen] = useState(differs);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink-faint hover:text-ink transition-colors duration-150 bg-transparent border-none p-0 cursor-pointer"
        >
          <Ruler size={13} />
          Measurements
          {differs && (
            <span className="text-[0.68rem] font-semibold text-brass bg-brass-bg px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              Differs from base
            </span>
          )}
        </button>
        {differs && (
          <button
            type="button"
            onClick={() => onChange(structuredCloneMeasurements(baseMeasurements))}
            className="flex items-center gap-1 text-[0.76rem] text-ink-faint hover:text-brass transition-colors duration-150 bg-transparent border-none p-0 cursor-pointer"
          >
            <RotateCcw size={11} /> Reset to base
          </button>
        )}
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[0.78rem] text-ink-faint hover:text-brass transition-colors duration-150 bg-transparent border-none p-0 cursor-pointer mt-1.5"
        >
          Same as base, click to override for this variation
        </button>
      ) : (
        <div className="mt-3">
          <MeasurementFieldsEditor category={category} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
