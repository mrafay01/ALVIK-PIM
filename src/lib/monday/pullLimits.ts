// Shared by the Monday Import screen and the pull route (no server imports,
// so the browser bundle can use it).
//
// The import sends the selected board items in chunks of this many ids per
// request: each request reads just those items from Monday (100 per call,
// ~2.5 s each) and writes them, which keeps it well inside the 60 s
// serverless limit however large the board is.
export const PULL_IMPORT_CHUNK = 500;
