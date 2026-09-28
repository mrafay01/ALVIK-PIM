import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Vendor from "@/models/Vendor";
import { Card } from "@/components/ui/Card";
import { QuoteImportForm } from "./QuoteImportForm";

export default async function QuoteImportPage() {
  await connectDB();
  const vendors = await Vendor.find({}).select("name").sort({ name: 1 }).lean();

  return (
    <AppShell
      activeHref="/purchase-orders"
      backHref="/purchase-orders/quotes"
      backLabel="Quotes"
      eyebrow="Vendor pipeline"
      title="Import Quote File"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Upload a vendor quote as <strong>.xlsx</strong>, legacy <strong>.xls</strong>, or{" "}
        <strong>.csv</strong>. Every line item is parsed and staged for review; nothing writes to
        the product database until you approve it. The column headers are matched by name (found
        anywhere in the first few rows), so the sheet can be in the vendor&apos;s own layout.
      </p>

      <Card className="max-w-[560px]">
        <QuoteImportForm vendors={vendors.map((v) => ({ id: String(v._id), name: v.name }))} />
      </Card>
    </AppShell>
  );
}
