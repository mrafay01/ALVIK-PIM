"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, KeyRound } from "lucide-react";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import type { Role } from "@/lib/enums";

const TD_CLASS = "px-4 py-3 text-[0.85rem] align-top";

export type UserRowData = {
  _id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export function UserRow({
  user,
  roles,
  roleLabel,
  isSelf,
}: {
  user: UserRowData;
  roles: readonly Role[];
  roleLabel: Record<Role, string>;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(next: Role) {
    setRole(next);
    await patch({ role: next });
  }

  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const ok = await patch({ password: newPassword });
    if (ok) {
      setResetOpen(false);
      setNewPassword("");
    }
  }

  return (
    <tr className="czc-row border-b border-border">
      <td className={TD_CLASS}>
        <div className="font-semibold text-ink">{user.name}</div>
        <div className="text-ink-faint text-[0.78rem] font-mono">{user.email}</div>
        {isSelf && <div className="text-brass text-[0.72rem] font-semibold mt-0.5">You</div>}
      </td>
      <td className={TD_CLASS}>
        <Select
          value={role}
          disabled={isSelf || saving}
          onChange={(e) => handleRoleChange(e.target.value as Role)}
          className="min-w-[190px]"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </Select>
      </td>
      <td className={TD_CLASS}>
        {user.active ? (
          <Pill tone="good" dot>
            Active
          </Pill>
        ) : (
          <Pill tone="neutral" dot>
            Deactivated
          </Pill>
        )}
      </td>
      <td className={`${TD_CLASS} text-ink-faint text-[0.8rem]`}>
        {(() => {
          const d = new Date(user.createdAt);
          return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
        })()}
      </td>
      <td className={`${TD_CLASS} !py-2`}>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2">
            {!resetOpen && (
              <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)} disabled={saving}>
                <span className="inline-flex items-center gap-1">
                  <KeyRound size={13} /> Reset password
                </span>
              </Button>
            )}
            {!isSelf &&
              (user.active ? (
                <Button size="sm" variant="danger" onClick={() => patch({ active: false })} disabled={saving}>
                  Deactivate
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => patch({ active: true })} disabled={saving}>
                  Reactivate
                </Button>
              ))}
          </div>

          {resetOpen && (
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                minLength={8}
                className="!py-1.5 !px-2 text-[0.8rem] w-[160px]"
              />
              <Button size="sm" variant="primary" onClick={handleResetPassword} disabled={saving}>
                <Check size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResetOpen(false);
                  setNewPassword("");
                  setError(null);
                }}
                disabled={saving}
              >
                <X size={13} />
              </Button>
            </div>
          )}

          {error && <p className="text-critical text-[0.76rem] m-0 text-right max-w-[220px]">{error}</p>}
        </div>
      </td>
    </tr>
  );
}
