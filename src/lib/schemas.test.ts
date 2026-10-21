import {
  ItemSpecsSchema,
  ITEM_TRANSITIONS,
  CatalogItemCreateSchema,
} from "@/lib/schemas";

describe("ItemSpecsSchema", () => {
  it("should accept valid specs", () => {
    const valid = {
      metal: "Silver",
      plating: "Gold",
      weight: "5.2",
      ringSize: "7",
    };
    const result = ItemSpecsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject spec value that is too long", () => {
    const invalid = {
      metal: "A".repeat(501),
    };
    const result = ItemSpecsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject too many spec fields", () => {
    const specs: Record<string, string> = {};
    for (let i = 0; i < 41; i++) {
      specs[`field${i}`] = "value";
    }
    const result = ItemSpecsSchema.safeParse(specs);
    expect(result.success).toBe(false);
  });
});

describe("CatalogItemCreateSchema — variations", () => {
  const minimalBase = {
    sku: "A1234",
    title: "Test Ring",
    category: "Ring",
  };

  it("accepts a base item with no variations", () => {
    const result = CatalogItemCreateSchema.safeParse(minimalBase);
    expect(result.success).toBe(true);
  });

  it("accepts a variation with a suffix, title override, and independentSku", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [
        {
          suffix: "GP",
          title: "Test Ring — Gold Plated",
          independentSku: "B5678",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("strips an msrp field sent on a variation rather than accepting it — MSRP is base-only", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [{ suffix: "GP", msrp: 999 }],
    });
    expect(result.success).toBe(true);
    // msrp is not a recognized key on CatalogVariationSchema, so Zod's
    // default (non-passthrough) object parsing drops it silently.
    expect(result.success && (result.data.variations?.[0] as Record<string, unknown>).msrp).toBeUndefined();
  });

  it("rejects a variation suffix with invalid characters", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [{ suffix: "GP!" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 variations", () => {
    const variations = Array.from({ length: 21 }, (_, i) => ({ suffix: `V${i}` }));
    const result = CatalogItemCreateSchema.safeParse({ ...minimalBase, variations });
    expect(result.success).toBe(false);
  });

  it("does not accept category/brand/gender/metal on a variation row (base-only fields)", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [{ suffix: "GP", category: "Bracelet", brand: "Other", gender: "Men" }],
    });
    expect(result.success).toBe(true);
    const v = result.success ? (result.data.variations?.[0] as Record<string, unknown>) : {};
    expect(v.category).toBeUndefined();
    expect(v.brand).toBeUndefined();
    expect(v.gender).toBeUndefined();
  });

  it("accepts a per-variation measurements override (e.g. a different ring size)", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [
        {
          suffix: "6",
          measurements: { ringSize: { value: 6, system: "US" } },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.variations?.[0].measurements?.ringSize).toEqual({
      value: 6,
      system: "US",
    });
  });

  it("rejects a variation measurements override with an invalid ring size system", () => {
    const result = CatalogItemCreateSchema.safeParse({
      ...minimalBase,
      variations: [{ suffix: "6", measurements: { ringSize: { value: 6, system: "XX" } } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("ITEM_TRANSITIONS", () => {
  it("should allow quoted -> review_pending", () => {
    expect(ITEM_TRANSITIONS.quoted).toContain("review_pending");
  });

  it("should allow approved -> sample_ordered", () => {
    expect(ITEM_TRANSITIONS.approved).toContain("sample_ordered");
  });

  it("should not allow skipping stages", () => {
    expect(ITEM_TRANSITIONS.quoted).not.toContain("sku_permanent");
  });

  it("should prevent transitions from rejected", () => {
    expect(ITEM_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("should prevent transitions from discontinued", () => {
    expect(ITEM_TRANSITIONS.discontinued).toHaveLength(0);
  });
});
