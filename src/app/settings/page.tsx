import { hasFullAccess } from "@/lib/enums";
import { getSession } from "@/lib/authz";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Users, ArrowRight, BellRing, UserCircle, KeyRound, Mail, ShieldCheck, Palette } from "lucide-react";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import type { Role } from "@/lib/enums";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { SecuritySettings } from "./SecuritySettings";
import { ThemeToggle } from "./ThemeToggle";

export default async function SettingsPage() {
  const session = await getSession();
  const role = session?.user?.role as Role | undefined;

  await connectDB();
  const user = await User.findById(session?.user?.id).select("name email role active").lean();

  return (
    <AppShell activeHref="/settings" eyebrow="Account" title="Settings">

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
            <Pill tone="brand">{role ? ROLE_LABEL[role] : "—"}</Pill>
          </dd>
        </dl>
        <p className="text-[0.78rem] text-ink-faint mt-3.5 mb-0">
          To change your name or role, ask an administrator.
        </p>
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-3.5">
          <Palette size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Appearance</h2>
        </div>
        <ThemeToggle />
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Change email</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-4">We&apos;ll send a code to the new address.</p>
        <ChangeEmailForm currentEmail={user?.email ?? ""} />
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Change password</h2>
        </div>
        <p className="text-[0.8rem] text-ink-faint mb-4">We&apos;ll send a code to your email.</p>
        <ChangePasswordForm />
      </Card>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={17} className="text-ink-faint" />
          <h2 className="text-[0.95rem] m-0">Security</h2>
        </div>
        <SecuritySettings />
      </Card>

      <Link href="/settings/notifications" className="no-underline block mb-6">
        <Card className="hover:border-brand transition-colors duration-150">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-bg text-brand shrink-0">
                <BellRing size={16} />
              </span>
              <div>
                <h2 className="text-[0.95rem] m-0">Notifications</h2>
                <p className="text-[0.8rem] text-ink-faint m-0 mt-0.5">Choose your emails.</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-ink-faint shrink-0" />
          </div>
        </Card>
      </Link>

      {hasFullAccess(role) && (
        <Link href="/admin/users" className="no-underline block">
          <Card className="hover:border-brand transition-colors duration-150">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-bg text-brand shrink-0">
                  <Users size={16} />
                </span>
                <div>
                  <h2 className="text-[0.95rem] m-0">Users &amp; Roles</h2>
                  <p className="text-[0.8rem] text-ink-faint m-0 mt-0.5">
                    Manage accounts and roles.
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
