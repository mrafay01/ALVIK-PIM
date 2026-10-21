// Every PO created in the app is named "PO-<number>". An uploaded vendor
// PI/quote file is named after its PO ("22906.xlsx" -> "PO-22906"); a
// hand-entered quote types the number instead ("22906" -> "PO-22906").
// A value that already starts with "PO-" isn't prefixed twice.
export function formatPoNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  const rest = /^po-/i.test(s) ? s.slice(3).trim() : s;
  return rest ? `PO-${rest}` : null;
}

export function poNumberFromFileName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return formatPoNumber(dot >= 0 ? base.slice(0, dot) : base);
}
