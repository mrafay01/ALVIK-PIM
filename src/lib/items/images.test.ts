import { conventionalImageName, imageCompletenessOf, mediaFileName } from "./images";
import { parseReviewParams, reviewQuery, reviewSearch } from "@/lib/import/reviewQuery";

describe("conventionalImageName", () => {
  const media = [
    { subfolder: "sides", url: "https://x/Images/A1/Sides/A1-S1.jpg" },
    { subfolder: "sides", name: "A1-S3.png", url: "https://x/a" },
    { subfolder: "models", url: "https://x/Images/A1/Models/A1-M1.jpg" },
  ];
  it("names main after the item", () => expect(conventionalImageName("A1", "main", ".jpg", media)).toBe("A1.jpg"));
  it("takes the next free side number", () => expect(conventionalImageName("A1", "sides", ".jpg", media)).toBe("A1-S4.jpg"));
  it("numbers models separately", () => expect(conventionalImageName("A1", "models", ".png", media)).toBe("A1-M2.png"));
  it("starts at 1", () => expect(conventionalImageName("B2", "sides", ".jpg", [])).toBe("B2-S1.jpg"));
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
  it("reads file names from urls", () => expect(mediaFileName({ url: "https://x/A%201.jpg?web=1" })).toBe("A 1.jpg"));
});

describe("review query", () => {
  it("defaults to all rows in file order", () => {
    const p = parseReviewParams({});
    expect(p).toMatchObject({ filter: "all", sort: "row" });
    expect(reviewQuery("b1", p)).toEqual({ batchId: "b1" });
    expect(reviewSearch(p)).toBe("");
  });
  it("combines filters and escapes search text", () => {
    const p = parseReviewParams({ filter: "rejected", q: "A1.2", brand: "CZ", sort: "bogus" });
    expect(p.sort).toBe("row");
    const q = reviewQuery("b1", p) as Record<string, unknown>;
    expect(q.reviewStatus).toBe("rejected");
    expect(q["coerced.brand"]).toBe("CZ");
    const rx = (q.$or as { "coerced.itemNumber": RegExp }[])[0]["coerced.itemNumber"];
    expect(rx.test("A1.2")).toBe(true);
    expect(rx.test("A1x2")).toBe(false); // the "." is literal, not "any character"
  });
});
