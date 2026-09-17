"use client";

import { Field, Input, Select } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Ruler } from "lucide-react";
import {
  getMeasurementSchema,
  GROUP_LABEL,
  type FieldGroup,
  type MeasurementFieldConfig,
} from "@/lib/measurements/schema";
import { LENGTH_UNITS, RING_SIZE_SYSTEMS, type ItemMeasurements, type Measurement } from "@/lib/measurements/types";

// The one place the category->fields UI is generated from config (§16) —
// used by both the "New catalog item" and "Edit item" forms so there is
// exactly one implementation of "which measurement boxes does a Ring
// need" rather than one per screen.
export function MeasurementFieldsEditor({
  category,
  value,
  onChange,
}: {
  category: string;
  value: ItemMeasurements;
  onChange: (next: ItemMeasurements) => void;
}) {
  const schema = getMeasurementSchema(category);

  if (!schema) {
    return (
      <Card>
        <SectionHeader />
        <p className="text-ink-faint text-[0.85rem] m-0">
          Select a category above to see its measurement fields.
        </p>
      </Card>
    );
  }

  function setValue(key: string, m: Measurement | null) {
    const values = { ...(value.values ?? {}) };
    if (m) values[key as keyof typeof values] = m;
    else delete values[key as keyof typeof values];
    onChange({ ...value, values });
  }

  function setRingSize(patch: Partial<{ value: number; system: string }>) {
    const current = value.ringSize ?? { value: NaN, system: "US" as const };
    onChange({
      ...value,
      ringSize: {
        value: patch.value ?? current.value,
        system: (patch.system ?? current.system) as (typeof RING_SIZE_SYSTEMS)[number],
      },
    });
  }

  const visibleFields = schema.fields.filter((f) => {
    if (f.conditionOn === "hasCharm") return !!value.hasCharm;
    if (f.conditionOn === "hasPendant") return !!value.hasPendant;
    if (f.conditionOn === "isOpen") return !!value.isOpen;
    if (f.conditionOnEarringType) return f.conditionOnEarringType.includes(value.earringType ?? ("" as never));
    return true;
  });

  const groups = groupFields(visibleFields);

  return (
    <div className="flex flex-col gap-5">
      {/* Category-level toggles that control which conditional fields show */}
      <Card>
        <SectionHeader hint={schema.category} />
        <div className="flex flex-wrap gap-4">
          {schema.category === "Bracelet" || schema.category === "Anklet" ? (
            <ToggleField
              label="Has a charm"
              checked={!!value.hasCharm}
              onChange={(v) => onChange({ ...value, hasCharm: v })}
            />
          ) : null}
          {schema.category === "Necklace" ? (
            <ToggleField
              label="Has a pendant"
              checked={!!value.hasPendant}
              onChange={(v) => onChange({ ...value, hasPendant: v })}
            />
          ) : null}
          {schema.category === "Bangle" ? (
            <ToggleField
              label="Open bangle / cuff"
              checked={!!value.isOpen}
              onChange={(v) => onChange({ ...value, isOpen: v })}
            />
          ) : null}
          {schema.supportsEarringType ? (
            <Field label="Earring type" width={160}>
              <Select
                value={value.earringType ?? ""}
                onChange={(e) =>
                  onChange({ ...value, earringType: (e.target.value || undefined) as ItemMeasurements["earringType"] })
                }
              >
                <option value="">Select type…</option>
                <option value="hoop">Hoop</option>
                <option value="stud">Stud</option>
                <option value="drop">Drop / Dangle</option>
              </Select>
            </Field>
          ) : null}
          {schema.supportsAdjustable ? (
            <ToggleField
              label="Adjustable"
              checked={!!value.adjustable}
              onChange={(v) => onChange({ ...value, adjustable: v })}
            />
          ) : null}
        </div>
      </Card>

      {groups.map(([group, fields]) => {
        const isAdjustabilityGroup = group === "adjustability";
        if (isAdjustabilityGroup && !schema.supportsAdjustable) return null;
        return (
          <Card key={group}>
            <h3 className="text-[0.85rem] font-semibold text-ink-faint uppercase tracking-wide m-0 mb-3.5">
              {GROUP_LABEL[group]}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((f) =>
                f.kind === "ring_size" ? (
                  <div key={f.key} className="flex gap-2.5 items-end sm:col-span-2 lg:col-span-1">
                    <Field label={`${f.label}${f.required ? " *" : ""}`} width={100}>
                      <Input
                        type="number"
                        step="0.25"
                        value={Number.isFinite(value.ringSize?.value) ? value.ringSize!.value : ""}
                        onChange={(e) => setRingSize({ value: e.target.value === "" ? NaN : Number(e.target.value) })}
                        required={f.required}
                      />
                    </Field>
                    <Field label="System" width={90}>
                      <Select
                        value={value.ringSize?.system ?? "US"}
                        onChange={(e) => setRingSize({ system: e.target.value })}
                      >
                        {RING_SIZE_SYSTEMS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : (
                  <MeasurementBox
                    key={f.key}
                    field={f}
                    value={value.values?.[f.key]}
                    onChange={(m) => setValue(f.key, m)}
                  />
                )
              )}
            </div>
          </Card>
        );
      })}

      {schema.supportsAdjustable && value.adjustable && (
        <Card>
          <h3 className="text-[0.85rem] font-semibold text-ink-faint uppercase tracking-wide m-0 mb-3.5">
            {GROUP_LABEL.adjustability}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MeasurementBox
              field={{ key: "adjustable_min_length", label: "Min length", group: "adjustability", kind: "length", defaultUnit: "cm" }}
              value={value.values?.adjustable_min_length}
              onChange={(m) => setValue("adjustable_min_length", m)}
            />
            <MeasurementBox
              field={{ key: "adjustable_max_length", label: "Max length", group: "adjustability", kind: "length", defaultUnit: "cm" }}
              value={value.values?.adjustable_max_length}
              onChange={(m) => setValue("adjustable_max_length", m)}
            />
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-[0.85rem] font-semibold text-ink-faint uppercase tracking-wide m-0 mb-3.5">
          Unparsed / raw measurement text
        </h3>
        <p className="text-ink-faint text-[0.78rem] mb-3 mt-0">
          A catch-all for supplier text that doesn&apos;t cleanly map to one of the fields above (e.g.
          combined dimensions like &quot;5x4mm&quot; from an import) — kept instead of dropped or guessed.
        </p>
        <Field label="Raw measurement note">
          <Input value={value.raw ?? ""} onChange={(e) => onChange({ ...value, raw: e.target.value })} />
        </Field>
      </Card>
    </div>
  );
}

function groupFields(fields: MeasurementFieldConfig[]): [FieldGroup, MeasurementFieldConfig[]][] {
  const order: FieldGroup[] = ["basic", "fit", "component", "chain", "opening"];
  const byGroup = new Map<FieldGroup, MeasurementFieldConfig[]>();
  for (const f of fields) {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group)!.push(f);
  }
  return order.filter((g) => byGroup.has(g)).map((g) => [g, byGroup.get(g)!]);
}

function SectionHeader({ hint }: { hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-brass shrink-0 flex items-center">
        <Ruler size={16} />
      </span>
      <h2 className="text-[0.92rem] font-semibold m-0">Measurements</h2>
      {hint && <span className="text-[0.78rem] text-ink-faint">— {hint}</span>}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[0.85rem] text-ink cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--brass)]"
      />
      {label}
    </label>
  );
}

function MeasurementBox({
  field,
  value,
  onChange,
}: {
  field: MeasurementFieldConfig;
  value: Measurement | undefined;
  onChange: (m: Measurement | null) => void;
}) {
  const unit = value?.unit ?? field.defaultUnit ?? "mm";
  const rawValue = value?.value;

  function handleValueChange(text: string) {
    if (text.trim() === "") {
      onChange(null);
      return;
    }
    const n = Number(text);
    onChange({ value: n, unit: (unit as never) });
  }

  function handleUnitChange(nextUnit: string) {
    if (rawValue === undefined || rawValue === null) {
      onChange(null);
      return;
    }
    onChange({ value: rawValue, unit: nextUnit as never, originalValue: value?.originalValue, source: value?.source });
  }

  return (
    <div className="flex gap-2 items-end">
      <Field label={`${field.label}${field.required ? " *" : ""}`} width="100%">
        <Input
          type="number"
          step="any"
          value={rawValue === undefined || rawValue === null || Number.isNaN(rawValue) ? "" : rawValue}
          onChange={(e) => handleValueChange(e.target.value)}
          required={field.required}
        />
      </Field>
      <Select value={unit} onChange={(e) => handleUnitChange(e.target.value)} className="!w-[70px] shrink-0">
        {LENGTH_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
    </div>
  );
}
