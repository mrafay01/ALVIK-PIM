// What a read-only "viewer" may send to the API. Plain reads are fine; the only
// writes allowed are to the person's own account (password, sign-out,
// notification choices), sign-in/out and the Help form. Used by middleware.ts,
// kept here so it can be unit tested.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const OWN_ACCOUNT_PREFIXES = ["/api/auth", "/api/users/me", "/api/support"];

export function viewerMayCallApi(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  return OWN_ACCOUNT_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}
