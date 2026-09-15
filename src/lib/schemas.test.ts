import {
  ItemCreateSchema,
  ItemSpecsSchema,
  ITEM_TRANSITIONS,
} from "@/lib/schemas";

describe("ItemCreateSchema", () => {
  it("should accept valid item creation", () => {
    const valid = {
      vendorId: "507f1f77bcf86cd799439011",
      vendorSku: "TEST-SKU-123",
      category: "Rings",
      costPerUnit: 50.0,
      msrp: 150.0,
      notes: "Sample notes",
    };
    const result = ItemCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject invalid ObjectId", () => {
    const invalid = {
      vendorId: "not-a-valid-id",
      vendorSku: "TEST-SKU-123",
    };
    const result = ItemCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject empty vendorSku", () => {
    const invalid = {
      vendorId: "507f1f77bcf86cd799439011",
      vendorSku: "",
    };
    const result = ItemCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject negative money values", () => {
    const invalid = {
      vendorId: "507f1f77bcf86cd799439011",
      vendorSku: "TEST-SKU",
      costPerUnit: -10.0,
    };
    const result = ItemCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should allow optional fields to be omitted", () => {
    const minimal = {
      vendorId: "507f1f77bcf86cd799439011",
      vendorSku: "TEST-SKU-123",
    };
    const result = ItemCreateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

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
