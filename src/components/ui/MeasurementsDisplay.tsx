import { Ruler } from "lucide-react";
import { SectionCard, FieldGrid, DetailField } from "@/components/ui/SectionCard";
import { getMeasurementSchema, GROUP_LABEL, type FieldGroup } from "@/lib/measurements/schema";
import { formatMeasurement, formatRingSize } from "@/lib/measurements/format";
import type { ItemMeasurements } from "@/lib/measurements/types";

// Read-only counterpart to MeasurementFieldsEditor — renders exactly the
// fields the item's category defines (§16), grouped the same way the
// editor groups them, using the one shared formatter (§21) rather than
// ad hoc `${value} ${unit}` string-building.
export function MeasurementsDisplay({
  category,
  measurements,
}: {
  category: string | null | undefined;
  measurements: ItemMeasurements | null | undefined;
}) {
  const schema = getMeasurementSchema(category);
  if (!schema) return null;

  const values = measurements?.values ?? {};
  const hasAnyValue =
    Object.keys(values).length > 0 || !!measurements?.ringSize || !!measurements?.raw;

  const byGroup = new Map<FieldGroup, { label: string; value: React.ReactNode }[]>();
  for (const field of schema.fields) {
    // Same visibility rules as the editor — an unset conditional toggle
    // hides its fields here too, so a Ring never shows a blank "Hoop
    // diameter" row, etc.
    if (field.conditionOn === "hasCharm" && !measurements?.hasCharm) continue;
    if (field.conditionOn === "hasPendant" && !measurements?.hasPendant) continue;
    if (field.conditionOn === "isOpen" && !measurements?.isOpen) continue;
    if (
      field.conditionOnEarringType &&
      !field.conditionOnEarringType.includes(measurements?.earringType ?? ("" as never))
    ) {
      continue;
    }

    const display =
      field.kind === "ring_size"
        ? formatRingSize(measurements?.ringSize)
        : formatMeasurement(values[field.key]);
    if (display === "—") continue; // only show fields that actually have a value

    if (!byGroup.has(field.group)) byGroup.set(field.group, []);
    byGroup.get(field.group)!.push({ label: field.label, value: display });
  }

  if (schema.supportsAdjustable && measurements?.adjustable) {
    const min = formatMeasurement(values.adjustable_min_length);
    const max = formatMeasurement(values.adjustable_max_length);
    if (min !== "—" || max !== "—") {
      byGroup.set("adjustability", [
        { label: "Min length", value: min },
        { label: "Max length", value: max },
      ]);
    }
  }

  const order: FieldGroup[] = ["basic", "fit", "adjustability", "component", "chain", "opening"];
  const groups = order.filter((g) => byGroup.has(g));

  if (!hasAnyValue && groups.length === 0) return null;

  return (
    <SectionCard title="Measurements" icon={<Ruler size={16} />} meta={schema.category}>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g}>
            <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
              {GROUP_LABEL[g]}
            </span>
            <div className="mt-2">
              <FieldGrid>
                {byGroup.get(g)!.map((f) => (
                  <DetailField key={f.label} label={f.label} value={f.value} />
                ))}
              </FieldGrid>
            </div>
          </div>
        ))}
        {measurements?.raw && (
          <div>
            <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
              Raw / unparsed note
            </span>
            <p className="text-[0.87rem] text-ink mt-1.5 mb-0">{measurements.raw}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
