import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-sunken p-5">
      <Card className="max-w-[380px] text-center">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-critical-bg text-critical mb-3.5">
          <ShieldOff size={20} />
        </span>
        <h1 className="text-lg mb-2">Not authorized</h1>
        <p className="text-ink-soft text-sm mb-[18px]">You don&apos;t have access to this page.</p>
        <Link href="/dashboard" className="text-[0.85rem] text-brand font-semibold no-underline">
          Back to Dashboard →
        </Link>
      </Card>
    </main>
  );
}
