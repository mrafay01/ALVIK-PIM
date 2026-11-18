"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import type { Role } from "@/lib/enums";
import { ResetPasswordPanel } from "./ResetPasswordPanel";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

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
  const { refresh, refreshing } = useRefreshAfterSave();
  const [role, setRole] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  // Which control started the save, so only that one shows a spinner.
  const [savingWhat, setSavingWhat] = useState<"role" | "active" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const working = saving || refreshing;

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setSavingWhat("role" in body ? "role" : "active");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed.");
      refresh();
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

  return (
    <tr className="czc-row border-b border-border">
      <td className={TD_CLASS}>
        <div className="font-semibold text-ink">{user.name}</div>
        <div className="text-ink-faint text-[0.78rem] font-mono">{user.email}</div>
        {isSelf && <div className="text-brand text-[0.72rem] font-semibold mt-0.5">You</div>}
      </td>
      <td className={TD_CLASS}>
        <Select
          value={role}
          disabled={isSelf || working}
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
            {/* Your own password is changed from Settings, not here. */}
            {!resetOpen && !isSelf && (
              <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)} disabled={working}>
                <span className="inline-flex items-center gap-1">
                  <KeyRound size={13} /> Reset password
                </span>
              </Button>
            )}
            {!isSelf &&
              (user.active ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => patch({ active: false })}
                  disabled={working}
                  loading={working && savingWhat === "active"}
                >
                  {working && savingWhat === "active" ? "Deactivating…" : "Deactivate"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => patch({ active: true })}
                  disabled={working}
                  loading={working && savingWhat === "active"}
                >
                  {working && savingWhat === "active" ? "Reactivating…" : "Reactivate"}
                </Button>
              ))}
          </div>

          {resetOpen && <ResetPasswordPanel targetUserId={user._id} onClose={() => setResetOpen(false)} />}

          {error && <p className="text-critical text-[0.76rem] m-0 text-right max-w-[220px]">{error}</p>}
        </div>
      </td>
    </tr>
  );
}
