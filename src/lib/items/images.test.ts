import { conventionalImageName, imageCompletenessOf, mediaFileName } from "./images";
import { searchFilter, scopeFilter, onReviewPage } from "@/lib/import/reviewQuery";

describe("conventionalImageName", () => {
  const media = [
    { subfolder: "sides", url: "https://x/Images/A1/Sides/A1-S1.jpg" },
    { subfolder: "sides", name: "A1-S3.png", url: "https://x/a" },
    { subfolder: "models", url: "https://x/Images/A1/Models/A1-M1.jpg" },
    { subfolder: "lifestyle", name: "A1-LS2.jpg", url: "https://x/b" },
  ];
  it("names main after the item", () => expect(conventionalImageName("A1", "main", ".jpg", media)).toBe("A1.jpg"));
  it("takes the next free side number", () => expect(conventionalImageName("A1", "sides", ".jpg", media)).toBe("A1-S4.jpg"));
  it("numbers models separately", () => expect(conventionalImageName("A1", "models", ".png", media)).toBe("A1-M2.png"));
  it("starts at 1", () => expect(conventionalImageName("B2", "sides", ".jpg", [])).toBe("B2-S1.jpg"));
  it("numbers lifestyle shots with LS, apart from sides", () => {
    expect(conventionalImageName("A1", "lifestyle", ".jpg", media)).toBe("A1-LS3.jpg");
    expect(conventionalImageName("B2", "lifestyle", ".png", [])).toBe("B2-LS1.png");
  });
});

describe("imageCompletenessOf", () => {
  it("ignores broken images", () => {
    expect(
      imageCompletenessOf([
        { subfolder: "main", linkStatus: "broken" },
        { subfolder: "sides", linkStatus: "ok" },
        { subfolder: "models" },
      ])
    ).toEqual({ main: false, sides: true, models: true });
  });
  it("doesn't need (or count) lifestyle images", () => {
    expect(
      imageCompletenessOf([{ subfolder: "main" }, { subfolder: "sides" }, { subfolder: "models" }])
    ).toEqual({ main: true, sides: true, models: true });
    expect(imageCompletenessOf([{ subfolder: "lifestyle" }])).toEqual({ main: false, sides: false, models: false });
  });
  it("reads file names from urls", () => expect(mediaFileName({ url: "https://x/A%201.jpg?web=1" })).toBe("A 1.jpg"));
});

describe("review row filters", () => {
  it("leaves out committed, excluded and parked rows", () => {
    expect(onReviewPage("b1")).toEqual({ batchId: "b1", committedItemId: null, parkedAt: null, reviewStatus: { $ne: "rejected" } });
  });
  it("splits flagged and unflagged rows", () => {
    expect(scopeFilter("flagged")).toEqual({ "flags.0": { $exists: true } });
    expect(scopeFilter("unflagged")).toEqual({ "flags.0": { $exists: false } });
    expect(scopeFilter("all")).toEqual({});
  });
  it("searches SKU and title, escaping the text", () => {
    expect(searchFilter("  ")).toEqual({});
    const rx = (searchFilter("A1.2").$or as { "coerced.itemNumber": RegExp }[])[0]["coerced.itemNumber"];
    expect(rx.test("A1.2")).toBe(true);
    expect(rx.test("A1x2")).toBe(false); // the "." is literal
  });
});
