// Writes `value` into `target` at the given dot-path, creating intermediate
// objects as needed. Used to turn the parser's flat `"specs.metal"` style
// keys into the nested shape Mongoose expects on the Item document.
export function setDotPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cursor[key] !== "object" || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}
