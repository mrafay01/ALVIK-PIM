// Route params arrive as arbitrary strings. Passing a malformed id to
// findById() throws a CastError, which surfaces as a 500 instead of the
// 404 the caller should get, so dynamic routes check with this first.
export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}
