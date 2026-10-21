import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Vendor from "@/models/Vendor";
import { NewQuoteForm } from "./NewQuoteForm";

export default async function NewQuotePage() {
  await connectDB();
  const vendors = await Vendor.find({}).select("name").sort({ name: 1 }).lean();

  return (
    <AppShell
      activeHref="/purchase-orders/quotes"
      backHref="/purchase-orders/quotes"
      backLabel="Quotes"
      eyebrow="Vendor pipeline"
      title="New Quote"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Enter a vendor quote by hand. One quote can carry many line items; add a row per item.
        On save, every row is staged for review before it becomes an item.
      </p>
      <NewQuoteForm vendors={vendors.map((v) => ({ id: String(v._id), name: v.name }))} />
    </AppShell>
  );
}
