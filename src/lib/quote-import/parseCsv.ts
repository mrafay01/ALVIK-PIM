// Minimal RFC 4180 CSV reader — enough for vendor quote exports, no
// dependency. Handles quoted fields, embedded commas/newlines, and escaped
// double-quotes (""). Rejects nothing; a ragged row is padded/truncated to
// the header width by the caller.
//
// Returns rows as string[][]; the first row is the header. Blank trailing
// lines are dropped.

export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present — Excel's "CSV UTF-8" export adds one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // handle CRLF and lone CR
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // flush the last field/row if the file didn't end with a newline
  if (field.length > 0 || row.length > 0) endRow();

  // drop fully-empty trailing rows
  while (rows.length > 0 && rows[rows.length - 1].every((v) => v.trim() === "")) {
    rows.pop();
  }

  return rows;
}
