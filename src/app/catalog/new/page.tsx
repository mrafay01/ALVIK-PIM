import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { getSessionRole, roleCan } from "@/lib/authz";
import { NewCatalogItemForm } from "./NewCatalogItemForm";

export default async function NewCatalogItemPage() {
  const role = await getSessionRole();
  if (!roleCan(role, ["catalog_manager"])) redirect("/unauthorized");

  return (
    <AppShell
      activeHref="/catalog/new"
      backHref="/catalog"
      backLabel="Catalog"
      eyebrow="Finalized database"
      title="New Catalog Item"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Add a product and any variations.
      </p>
      <NewCatalogItemForm />
    </AppShell>
  );
}
