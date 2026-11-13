"use client";

export type CatalogExportRequest = {
  flaggedColumn: boolean;
  itemIds?: string[];
  skus?: string[];
  filters?: Record<string, string | undefined>;
};

// Asks the server for the catalog export and saves the file. Returns how
// many items it holds; throws with a message the screen can show.
export async function downloadCatalogExport(body: CatalogExportRequest): Promise<number> {
  let res: Response;
  try {
    res = await fetch("/api/catalog/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Try again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "catalog-export.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return Number(res.headers.get("X-Export-Rows") ?? 0);
}
