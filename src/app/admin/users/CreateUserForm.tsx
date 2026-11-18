"use client";

import { useState } from "react";
import { CircleAlert, UserPlus } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { Role } from "@/lib/enums";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

export function CreateUserForm({ roles, roleLabel }: { roles: readonly Role[]; roleLabel: Record<Role, string> }) {
  const { refresh, refreshing } = useRefreshAfterSave();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(roles[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Couldn't create the user.");
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole(roles[0]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
        </Field>
        <Field label="Temporary password">
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            maxLength={200}
            placeholder="At least 10 characters, with a letter and a number"
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && (
        <ErrorText>
          <CircleAlert size={14} /> {error}
        </ErrorText>
      )}

      <div>
        <Button type="submit" variant="primary" loading={submitting || refreshing}>
          <span className="inline-flex items-center gap-1.5">
            {!(submitting || refreshing) && <UserPlus size={15} />} {submitting || refreshing ? "Creating…" : "Create user"}
          </span>
        </Button>
      </div>
    </form>
  );
}
