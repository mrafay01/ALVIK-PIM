import { conventionalImageName, imageCompletenessOf, mediaFileName, mediaFileProblem } from "./images";
import { searchFilter, scopeFilter, onReviewPage } from "@/lib/import/reviewQuery";

describe("conventionalImageName", () => {
  const media = [
    { subfolder: "sides", url: "https://x/Images/A1/Sides/A1-S1.jpg" },
    { subfolder: "sides", name: "A1-S3.png", url: "https://x/a" },
    { subfolder: "models", url: "https://x/Images/A1/Models/A1-M1.jpg" },
    { subfolder: "lifestyle", name: "A1-LS2.jpg", url: "https://x/b" },
    { subfolder: "videos", name: "A1-V1.mp4", url: "https://x/c" },
  ];
  it("names main after the item", () => expect(conventionalImageName("A1", "main", ".jpg", media)).toBe("A1.jpg"));
  it("takes the next free side number", () => expect(conventionalImageName("A1", "sides", ".jpg", media)).toBe("A1-S4.jpg"));
  it("numbers models separately", () => expect(conventionalImageName("A1", "models", ".png", media)).toBe("A1-M2.png"));
  it("starts at 1", () => expect(conventionalImageName("B2", "sides", ".jpg", [])).toBe("B2-S1.jpg"));
  it("numbers lifestyle shots with LS, apart from sides", () => {
    expect(conventionalImageName("A1", "lifestyle", ".jpg", media)).toBe("A1-LS3.jpg");
    expect(conventionalImageName("B2", "lifestyle", ".png", [])).toBe("B2-LS1.png");
  });
  it("numbers video clips with V, apart from the images", () => {
    expect(conventionalImageName("A1", "videos", ".mp4", media)).toBe("A1-V2.mp4");
    expect(conventionalImageName("B2", "videos", ".mov", [])).toBe("B2-V1.mov");
  });
});

describe("mediaFileProblem", () => {
  it("takes videos only in the Videos folder", () => {
    expect(mediaFileProblem("Videos", "clip.MP4", 10)).toBeNull();
    expect(mediaFileProblem("Videos", "A1.jpg", 10)).toMatch(/isn't a video/);
    expect(mediaFileProblem("Videos", "clip.mp4", 2 * 1024 ** 3)).toMatch(/larger than 1 GB/);
  });
  it("takes images only everywhere else, pointing videos to the video type", () => {
    expect(mediaFileProblem("Main", "A1.jpg", 10)).toBeNull();
    expect(mediaFileProblem("Sides", "clip.mp4", 10)).toMatch(/upload it as a video clip/);
    expect(mediaFileProblem("Models", "notes.pdf", 10)).toMatch(/isn't an image/);
    expect(mediaFileProblem("Lifestyle", "big.jpg", 60 * 1024 ** 2)).toMatch(/larger than 50 MB/);
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
    expect(imageCompletenessOf([{ subfolder: "videos" }])).toEqual({ main: false, sides: false, models: false });
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
