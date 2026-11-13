// Shared by the catalog export screens and the server (no server imports,
// so the browser bundle can use it). One export holds at most this many
// items: it keeps the file well under the hosting platform's 4.5 MB
// response cap and the request inside its time limit.
export const MAX_EXPORT_ITEMS = 10_000;
