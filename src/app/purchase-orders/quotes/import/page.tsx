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
      activeHref="/purchase-orders/quotes"
      backHref="/purchase-orders/quotes"
      backLabel="Quotes"
      eyebrow="Vendor pipeline"
      title="Import Quote File"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Upload an Excel or CSV quote. You&apos;ll review every line before it&apos;s saved.
      </p>

      <Card className="max-w-[560px]">
        <QuoteImportForm vendors={vendors.map((v) => ({ id: String(v._id), name: v.name }))} />
      </Card>
    </AppShell>
  );
}
