import { redirect } from "next/navigation";

// Moved to Catalog → Import Master File.
export default async function LegacyBatchRedirect({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  redirect(`/catalog/import/${encodeURIComponent(batchId)}`);
}
