import { AppShell } from "@/components/app/AppShell";
import { getSession } from "@/lib/authz";
import { Card } from "@/components/ui/Card";
import { SUPPORT_CONTACT } from "@/lib/support";
import { Mail, Code2, MessageSquareText, ListChecks, BookOpen } from "lucide-react";
import { SupportForm } from "./SupportForm";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "I didn't get my sign-in code",
    a: (
      <>
        Codes come from the app&apos;s email address and expire after 10 minutes. Check your spam or junk
        folder, then request a new code. If you still get nothing, use the form below with the email address
        you sign in with.
      </>
    ),
  },
  {
    q: "A page says “Not authorized”",
    a: (
      <>
        Each role sees different parts of the app. For example, only Buying / Purchasing can change a PO, and
        only admins can import the Master File. Ask an administrator to check your role under Settings → Users
        &amp; Roles.
      </>
    ),
  },
  {
    q: "How should image files be named?",
    a: (
      <>
        Start every file name with the item number: <code>A1234.jpg</code> is the main photo,{" "}
        <code>A1234-S1.jpg</code>, <code>A1234-S2.jpg</code> are side shots, and <code>A1234-M1.jpg</code> are
        model shots. The app files each one into the right SharePoint folder from the name.
      </>
    ),
  },
  {
    q: "Where do uploaded PO files go?",
    a: (
      <>
        Every PO file is saved in SharePoint under <code>Purchase Orders/&lt;PO number&gt;</code>, whether it
        was uploaded here or attached on Monday. Open a PO and use “Open folder in SharePoint”. You need access
        to the CZCPIM SharePoint site to open those links.
      </>
    ),
  },
  {
    q: "A vendor quote says “Pick which sheet”",
    a: (
      <>
        The workbook has more than one tab that looks like an item list. Choose the tab with the items; the
        file isn&apos;t uploaded again.
      </>
    ),
  },
  {
    q: "What is a catalog conflict?",
    a: (
      <>
        When a new PI gives a different weight, size or vendor SKU for an item already in the catalog, the
        catalog value is kept and the difference is listed under Catalog → Conflicts for someone to keep,
        accept or correct.
      </>
    ),
  },
  {
    q: "Why isn't an item on Un-Verified Items?",
    a: (
      <>
        Items from a manual or uploaded quote appear once the quote is committed. Items from Monday appear once
        their PO reaches <em>In Production</em>. Items already in the catalog aren&apos;t listed there.
      </>
    ),
  },
];

const INCLUDE = [
  "What you were trying to do",
  "What happened instead, and any error message (a screenshot helps)",
  "The PO number, item number or page link",
  "Roughly when it happened",
];

export default async function HelpPage() {
  const session = await getSession();
  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  return (
    <AppShell activeHref="/help" eyebrow="Help" title="Help & Support">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Stuck on something? Check the common questions below, or send a message straight to the developer.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <Card>
            <h2 className="text-[0.95rem] mb-1 flex items-center gap-2">
              <MessageSquareText size={16} className="text-brass" /> Send a message
            </h2>
            <p className="text-[0.84rem] text-ink-soft mb-4">
              Goes to {SUPPORT_CONTACT.name} by email. Replies come to your own inbox.
            </p>
            <SupportForm name={name} email={email} />
          </Card>

          <Card>
            <h2 className="text-[0.95rem] mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-brass" /> Common questions
            </h2>
            <div className="flex flex-col divide-y divide-[color:var(--border)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-3">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-[0.9rem] font-semibold text-ink">
                    {f.q}
                    <span className="text-brass font-mono text-[1rem] group-open:rotate-45 transition-transform duration-150">
                      +
                    </span>
                  </summary>
                  <div className="text-[0.86rem] text-ink-soft mt-2 leading-relaxed">{f.a}</div>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-11 h-11 rounded-full bg-brass-bg text-brass shrink-0">
                <Code2 size={20} />
              </span>
              <div>
                <div className="font-semibold text-[0.95rem]">{SUPPORT_CONTACT.name}</div>
                <div className="text-[0.8rem] text-ink-faint">{SUPPORT_CONTACT.role}, CZC PIM</div>
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_CONTACT.email}?subject=${encodeURIComponent("CZC PIM help")}`}
              className="flex items-center gap-2 text-[0.88rem] text-brass font-semibold no-underline break-all"
            >
              <Mail size={15} className="shrink-0" /> {SUPPORT_CONTACT.email}
            </a>
            <p className="text-[0.8rem] text-ink-faint mt-3 mb-0">
              For anything about the app: errors, access, missing data or new features.
            </p>
          </Card>

          <Card>
            <h2 className="text-[0.9rem] mb-2.5 flex items-center gap-2">
              <ListChecks size={15} className="text-brass" /> What to include
            </h2>
            <ul className="m-0 pl-4 text-[0.84rem] text-ink-soft flex flex-col gap-1.5">
              {INCLUDE.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
