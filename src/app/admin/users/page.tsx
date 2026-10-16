import { getSession } from "@/lib/authz";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { Card } from "@/components/ui/Card";
import { ROLES, type Role } from "@/lib/enums";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import { CreateUserForm } from "./CreateUserForm";
import { UserRow, type UserRowData } from "./UserRow";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";

export default async function UsersPage() {
  const session = await getSession();
  const selfId = session?.user?.id;

  await connectDB();
  const users = await User.find({})
    .select("name email role active createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return (
    <AppShell activeHref="/admin/users" eyebrow="Administration" title="Users & Roles">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Create accounts and assign the role that controls what each person can see and do across
        the app. Only administrators can reach this page; everyone else is provisioned here, not
        by anyone editing their own access.
      </p>

      <Card className="mb-8">
        <h2 className="text-[0.95rem] mb-3.5">Create a user</h2>
        <CreateUserForm roles={ROLES} roleLabel={ROLE_LABEL} />
      </Card>

      <h2 className="text-[0.95rem] mb-3.5">All users ({users.length})</h2>
      {users.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No users yet.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["User", "Role", "Status", "Created", ""].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users as unknown as UserRowData[]).map((u) => {
                  const id = String(u._id);
                  return (
                    <UserRow
                      key={id}
                      user={{
                        _id: id,
                        name: u.name,
                        email: u.email,
                        role: u.role as Role,
                        active: u.active,
                        createdAt: String(u.createdAt),
                      }}
                      roles={ROLES}
                      roleLabel={ROLE_LABEL}
                      isSelf={id === selfId}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
