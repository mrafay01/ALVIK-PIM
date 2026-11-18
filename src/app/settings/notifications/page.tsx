import { getSession } from "@/lib/authz";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { Card } from "@/components/ui/Card";
import { BellRing, ShieldCheck } from "lucide-react";
import type { Role } from "@/lib/enums";
import { isMailConfigured } from "@/lib/mailer";
import { NOTIFICATION_EVENTS, eventsForRole, isEnabled, type StoredPrefs } from "@/lib/notifications/events";
import { NotificationPrefsForm, type NotificationToggle } from "../NotificationPrefsForm";

export default async function NotificationsSettingsPage() {
  const session = await getSession();
  const role = session?.user?.role as Role;

  await connectDB();
  const user = await User.findById(session?.user?.id).select("email notificationPrefs").lean();
  const prefs = (user?.notificationPrefs ?? undefined) as StoredPrefs;

  const toggles: NotificationToggle[] = eventsForRole(role).map((key) => {
    const def = NOTIFICATION_EVENTS[key];
    return {
      key,
      label: def.label,
      helper: def.helper,
      category: def.category,
      enabled: isEnabled(key, role, prefs),
      defaultOn: (def.defaultOn as readonly Role[]).includes(role),
    };
  });

  return (
    <AppShell
      activeHref="/settings/notifications"
      eyebrow="Account"
      title="Notifications"
      backHref="/settings"
      backLabel="Settings"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Choose which emails you get. Changes save automatically.
      </p>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <BellRing size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Email notifications</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-2">
          Sent to <span className="font-mono text-ink-soft">{user?.email ?? session?.user?.email}</span>.
        </p>
        <NotificationPrefsForm toggles={toggles} mailConfigured={isMailConfigured()} />
      </Card>

      <Card className="mt-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Account security emails</h2>
        </div>
        <p className="text-[0.82rem] text-ink-soft m-0 max-w-[68ch]">
          Always on: password, email, role and account changes.
        </p>
      </Card>
    </AppShell>
  );
}
