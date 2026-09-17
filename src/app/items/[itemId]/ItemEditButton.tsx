import Link from "next/link";
import { Pencil } from "lucide-react";

export function ItemEditButton({ itemId }: { itemId: string }) {
  return (
    <Link
      href={`/items/${itemId}/edit`}
      className="inline-flex items-center gap-1.5 font-body font-semibold text-[0.8rem] px-3 py-1.5 rounded-sm bg-surface text-ink border border-border-strong no-underline transition-[border-color,color] duration-150 hover:border-brass hover:text-brass"
    >
      <Pencil size={14} />
      Edit
    </Link>
  );
}
