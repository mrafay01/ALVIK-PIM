import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { Card } from "@/components/ui/Card";
import { BellRing } from "lucide-react";
import { NotificationPrefsForm, type NotificationPrefs } from "../NotificationPrefsForm";

const DEFAULT_PREFS: NotificationPrefs = {
  poStatusChanges: true,
  mondaySyncErrors: true,
  paymentDue: true,
  weeklyDigest: false,
};

export default async function NotificationsSettingsPage() {
  const session = await getServerSession(authOptions);

  await connectDB();
  const user = await User.findById(session?.user?.id).select("notificationPrefs").lean();

  const prefs: NotificationPrefs = { ...DEFAULT_PREFS, ...(user?.notificationPrefs ?? {}) };

  return (
    <AppShell
      activeHref="/settings/notifications"
      eyebrow="Account"
      title="Notifications"
      backHref="/settings"
      backLabel="Settings"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Choose what you want to be notified about. Changes save immediately.
      </p>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <BellRing size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Notification preferences</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-1">
          These control what you&apos;re alerted about, not how (email vs. in-app) — that&apos;s not configurable yet.
        </p>
        <NotificationPrefsForm initialPrefs={prefs} />
      </Card>
    </AppShell>
  );
}
