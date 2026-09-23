import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Users, ArrowRight, BellRing, UserCircle, KeyRound } from "lucide-react";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import type { Role } from "@/lib/enums";
import { NotificationPrefsForm, type NotificationPrefs } from "./NotificationPrefsForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

const DEFAULT_PREFS: NotificationPrefs = {
  poStatusChanges: true,
  mondaySyncErrors: true,
  paymentDue: true,
  weeklyDigest: false,
};

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;

  await connectDB();
  const user = await User.findById(session?.user?.id).select("name email role active notificationPrefs").lean();

  const prefs: NotificationPrefs = { ...DEFAULT_PREFS, ...(user?.notificationPrefs ?? {}) };

  return (
    <AppShell activeHref="/settings" eyebrow="Account" title="Settings">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Your account details, notification preferences, and — for administrators — user &amp; role management.
      </p>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-3.5">
          <UserCircle size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Your account</h2>
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2.5 m-0 text-[0.87rem]">
          <dt className="text-ink-faint">Name</dt>
          <dd className="m-0">{user?.name ?? "—"}</dd>
          <dt className="text-ink-faint">Email</dt>
          <dd className="m-0 font-mono">{user?.email ?? "—"}</dd>
          <dt className="text-ink-faint">Role</dt>
          <dd className="m-0">
            <Pill tone="brass">{role ? ROLE_LABEL[role] : "—"}</Pill>
          </dd>
        </dl>
        <p className="text-[0.78rem] text-ink-faint mt-3.5 mb-0">
          Need your name or email changed? Ask an administrator — self-service editing of those isn&apos;t available
          here. You can change your own password below.
        </p>
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Change password</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-4">
          Requires your current password. You&apos;ll stay signed in on this device afterward.
        </p>
        <ChangePasswordForm />
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BellRing size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Notifications</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-1">
          Choose what you want to be notified about. Changes save immediately.
        </p>
        <NotificationPrefsForm initialPrefs={prefs} />
      </Card>

      {role === "administrator" && (
        <Link href="/admin/users" className="no-underline block">
          <Card className="hover:border-brass transition-colors duration-150">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brass-bg text-brass shrink-0">
                  <Users size={16} />
                </span>
                <div>
                  <h2 className="text-[0.95rem] m-0">Users &amp; Roles</h2>
                  <p className="text-[0.8rem] text-ink-faint m-0 mt-0.5">
                    Create accounts, change roles, deactivate or reset passwords.
                  </p>
                </div>
              </div>
              <ArrowRight size={16} className="text-ink-faint shrink-0" />
            </div>
          </Card>
        </Link>
      )}
    </AppShell>
  );
}
