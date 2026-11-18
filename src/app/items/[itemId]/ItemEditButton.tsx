import Link from "next/link";
import { Pencil } from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";

export function ItemEditButton({ itemId }: { itemId: string }) {
  return (
    <Link
      href={`/items/${itemId}/edit`}
      className={buttonClasses("secondary", "sm")}
    >
      <Pencil size={14} />
      Edit
    </Link>
  );
}
