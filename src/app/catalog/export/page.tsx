import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import { Card } from "@/components/ui/Card";
import { SkuExportFlow } from "./SkuExportFlow";

// Catalog export from a list of SKUs: upload a one-column file ("SKUs" in
// A1), confirm what was found, download the items in the Master File layout.
// (Ticking items on the Catalog list is the other way in.)
export default async function CatalogExportPage() {
  if (!roleCan(await getSessionRole(), ROLE_SETS.catalogExport)) redirect("/unauthorized");

  return (
    <AppShell
      activeHref="/catalog/export"
      eyebrow="Catalog"
      title="Export catalog"
      backHref="/catalog"
    >
      <p className="text-ink-soft max-w-[72ch] mb-5 text-[0.92rem]">
        Upload a SKU list, or{" "}
        <Link href="/catalog" className="text-brand font-semibold no-underline">
          pick items in the Catalog
        </Link>
        .
      </p>
      <Card>
        <SkuExportFlow />
      </Card>
    </AppShell>
  );
}
