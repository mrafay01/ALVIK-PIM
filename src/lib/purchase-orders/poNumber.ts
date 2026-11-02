// A PO is stored by its bare number ("22906"), the same as Monday names it,
// so an uploaded PI, a hand-entered quote and the Monday board item for one
// order all land on the same PO. "PO-22906" is only how people write it:
// a leading "PO" (with "-", " ", "#", "_", ":" or "." or straight before a
// digit) and stray "#"s are dropped. A name that merely starts with the
// letters PO, like "POLO-5", is left as it is.
const PO_PREFIX = /^po(?:[\s\-#_:.]+|(?=\d))/i;

export function formatPoNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(PO_PREFIX, "").replace(/^#+|#+$/g, "").trim();
  return s || null;
}

// An uploaded vendor PI/quote file is named after its PO: "22906.xlsx" and
// "PO-22906.xlsx" are both PO 22906.
export function poNumberFromFileName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return formatPoNumber(dot >= 0 ? base.slice(0, dot) : base);
}
