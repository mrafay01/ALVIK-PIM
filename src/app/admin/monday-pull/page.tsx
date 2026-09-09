import { AppShell } from "@/components/app/AppShell";
import { MondayPullPanel } from "./MondayPullPanel";

export default function MondayPullPage() {
  return (
    <AppShell title="Monday Import" eyebrow="Admin" activeHref="/admin/monday-pull">
      <MondayPullPanel />
    </AppShell>
  );
}
