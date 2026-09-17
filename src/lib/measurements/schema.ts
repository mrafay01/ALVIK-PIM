import type { MeasurementFieldKey, LengthUnit } from "./types";
import { CATEGORY_OPTIONS } from "@/lib/itemPicklists";

export type JewelryCategory = (typeof CATEGORY_OPTIONS)[number];

// Which UI group a field belongs to (§28) — purely a display grouping,
// has no effect on storage or validation.
export type FieldGroup =
  | "basic"
  | "fit"
  | "adjustability"
  | "component"
  | "chain"
  | "opening";

export type FieldKind = "length" | "ring_size" | "boolean" | "select";

export interface MeasurementFieldConfig {
  key: MeasurementFieldKey;
  label: string;
  group: FieldGroup;
  kind: FieldKind;
  required?: boolean;
  /** Shown among the first/primary fields for this category (§3 "recommended"). */
  recommended?: boolean;
  /** Default unit offered for this field when the user hasn't chosen one. */
  defaultUnit?: LengthUnit;
  /** Only rendered when the named toggle on ItemMeasurements is true. */
  conditionOn?: "hasCharm" | "hasPendant" | "isOpen";
  /** Only rendered when earringType equals one of these (earring category only). */
  conditionOnEarringType?: ("hoop" | "stud" | "drop")[];
}

export interface CategoryMeasurementConfig {
  category: JewelryCategory;
  fields: MeasurementFieldConfig[];
  /** Adjustable min/max length is offered for this category (§14). */
  supportsAdjustable?: boolean;
  /** Category has a conditional "has a chain" style toggle, distinct from adjustable. */
  supportsEarringType?: boolean;
}

const len = (
  key: MeasurementFieldKey,
  label: string,
  group: FieldGroup,
  opts: Partial<MeasurementFieldConfig> = {}
): MeasurementFieldConfig => ({ key, label, group, kind: "length", defaultUnit: "mm", ...opts });

// One entry per supported category (§16). Adding a new category — or a
// new field to an existing one — never requires a schema migration: this
// is plain config, and MeasurementValues/Item.measurements.values already
// accepts any MeasurementFieldKey.
export const MEASUREMENT_SCHEMAS: Record<JewelryCategory, CategoryMeasurementConfig> = {
  Bracelet: {
    category: "Bracelet",
    supportsAdjustable: true,
    fields: [
      len("length", "Length", "basic", { recommended: true }),
      len("width", "Width", "basic", { recommended: true }),
      len("thickness", "Thickness", "basic", { recommended: true }),
      len("circumference", "Circumference", "fit", { recommended: true }),
      len("inner_length", "Inner length", "fit"),
      len("inner_width", "Inner width", "fit"),
      len("inner_circumference", "Inner circumference", "fit"),
      len("diameter", "Diameter", "fit"),
      len("chain_width", "Chain width", "chain"),
      len("charm_height", "Charm height", "component", { conditionOn: "hasCharm" }),
      len("charm_width", "Charm width", "component", { conditionOn: "hasCharm" }),
      len("charm_thickness", "Charm thickness", "component", { conditionOn: "hasCharm" }),
    ],
  },

  Ring: {
    category: "Ring",
    fields: [
      { key: "ring_size", label: "Ring size", group: "fit", kind: "ring_size", required: true, recommended: true },
      len("inner_diameter", "Inner diameter", "fit"),
      len("inner_circumference_ring", "Inner circumference", "fit"),
      len("band_width", "Band width", "basic", { recommended: true }),
      len("band_thickness", "Band thickness", "basic", { recommended: true }),
      len("top_width", "Top width", "basic"),
      len("top_length", "Top length", "basic"),
      len("ring_height", "Ring height", "basic"),
      len("setting_height", "Setting height", "basic"),
      len("shank_width", "Shank width", "fit"),
      len("shank_thickness", "Shank thickness", "fit"),
    ],
  },

  Pendant: {
    category: "Pendant",
    fields: [
      len("height", "Height", "basic", { recommended: true }),
      len("width", "Width", "basic", { recommended: true }),
      len("thickness", "Thickness", "basic", { recommended: true }),
      len("bail_height", "Bail height", "component"),
      len("bail_width", "Bail width", "component"),
      len("bail_inner_height", "Bail inner height", "component", { recommended: true }),
      len("bail_inner_width", "Bail inner width", "component", { recommended: true }),
      len("chain_length", "Chain length", "chain", { recommended: true }),
      len("chain_width", "Chain width", "chain", { recommended: true }),
      len("chain_thickness", "Chain thickness", "chain"),
    ],
  },

  Earring: {
    category: "Earring",
    supportsEarringType: true,
    fields: [
      len("height", "Height", "basic", { recommended: true }),
      len("width", "Width", "basic", { recommended: true }),
      len("thickness", "Thickness", "basic", { recommended: true }),
      len("drop_length", "Drop length", "component", {
        recommended: true,
        conditionOnEarringType: ["drop"],
      }),
      len("hoop_diameter", "Hoop diameter", "component", {
        recommended: true,
        conditionOnEarringType: ["hoop"],
      }),
      len("hoop_width", "Hoop width", "component", {
        recommended: true,
        conditionOnEarringType: ["hoop"],
      }),
      len("post_length", "Post length", "component", {
        recommended: true,
        conditionOnEarringType: ["stud"],
      }),
      len("post_thickness", "Post thickness", "component", {
        recommended: true,
        conditionOnEarringType: ["stud"],
      }),
      len("front_height", "Front height", "component", { conditionOnEarringType: ["stud"] }),
      len("front_width", "Front width", "component", { conditionOnEarringType: ["stud"] }),
      len("backing_height", "Backing height", "component"),
      len("backing_width", "Backing width", "component"),
    ],
  },

  Bangle: {
    category: "Bangle",
    fields: [
      len("inner_diameter", "Inner diameter", "fit", { recommended: true }),
      len("inner_circumference", "Inner circumference", "fit", { recommended: true }),
      len("outer_diameter", "Outer diameter", "fit", { recommended: true }),
      len("outer_circumference", "Outer circumference", "fit"),
      len("width", "Width", "basic", { recommended: true }),
      len("thickness", "Thickness", "basic", { recommended: true }),
      len("opening_width", "Opening width", "opening", { conditionOn: "isOpen" }),
      len("opening_height", "Opening height", "opening", { conditionOn: "isOpen" }),
      len("gap_width", "Gap width", "opening", { conditionOn: "isOpen" }),
      len("gap_height", "Gap height", "opening", { conditionOn: "isOpen" }),
      len("profile_height", "Profile height", "basic"),
    ],
  },

  Necklace: {
    category: "Necklace",
    supportsAdjustable: true,
    fields: [
      len("length", "Necklace length", "basic", { recommended: true }),
      len("width", "Width", "basic"),
      len("thickness", "Thickness", "basic"),
      len("chain_length", "Chain length", "chain", { recommended: true }),
      len("chain_width", "Chain width", "chain", { recommended: true }),
      len("chain_thickness", "Chain thickness", "chain", { recommended: true }),
      len("pendant_height", "Pendant height", "component", {
        recommended: true,
        conditionOn: "hasPendant",
      }),
      len("pendant_width", "Pendant width", "component", {
        recommended: true,
        conditionOn: "hasPendant",
      }),
      len("pendant_thickness", "Pendant thickness", "component", {
        recommended: true,
        conditionOn: "hasPendant",
      }),
      len("drop_length", "Drop length", "component", { recommended: true, conditionOn: "hasPendant" }),
      len("clasp_width", "Clasp width", "component"),
      len("clasp_length", "Clasp length", "component"),
    ],
  },

  Anklet: {
    category: "Anklet",
    supportsAdjustable: true,
    fields: [
      len("length", "Length", "basic", { recommended: true }),
      len("width", "Width", "basic", { recommended: true }),
      len("thickness", "Thickness", "basic", { recommended: true }),
      len("circumference", "Circumference", "fit", { recommended: true }),
      len("chain_width", "Chain width", "chain", { recommended: true }),
      len("chain_thickness", "Chain thickness", "chain", { recommended: true }),
      len("charm_height", "Charm height", "component", { conditionOn: "hasCharm" }),
      len("charm_width", "Charm width", "component", { conditionOn: "hasCharm" }),
      len("charm_thickness", "Charm thickness", "component", { conditionOn: "hasCharm" }),
      len("drop_length", "Drop length", "component", { recommended: true }),
    ],
  },
};

export function isJewelryCategory(category: string | null | undefined): category is JewelryCategory {
  return !!category && category in MEASUREMENT_SCHEMAS;
}

export function getMeasurementSchema(category: string | null | undefined): CategoryMeasurementConfig | null {
  return isJewelryCategory(category) ? MEASUREMENT_SCHEMAS[category] : null;
}

export const GROUP_LABEL: Record<FieldGroup, string> = {
  basic: "Basic measurements",
  fit: "Fit & size",
  adjustability: "Adjustability",
  component: "Component measurements",
  chain: "Chain measurements",
  opening: "Opening / gap",
};
