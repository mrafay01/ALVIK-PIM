import { redirect } from "next/navigation";

// Moved to Catalog → Import Master File.
export default function LegacyImportRedirect() {
  redirect("/catalog/import");
}
