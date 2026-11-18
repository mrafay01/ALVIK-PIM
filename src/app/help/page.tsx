import { AppShell } from "@/components/app/AppShell";
import { getSession } from "@/lib/authz";
import { Card } from "@/components/ui/Card";
import { SUPPORT_CONTACT } from "@/lib/support";
import { Mail, Code2, MessageSquareText, ListChecks, BookOpen } from "lucide-react";
import { SupportForm } from "./SupportForm";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "I didn't get my sign-in code",
    a: <>Check your spam folder, then request a new code. Codes expire after 10 minutes.</>,
  },
  {
    q: "A page says “Not authorized”",
    a: <>Your role can&apos;t open that page. Ask an administrator to check your role.</>,
  },
  {
    q: "How should image files be named?",
    a: (
      <>
        Start with the item number: <code>A1234.jpg</code> (main), <code>A1234-S1.jpg</code> (side),{" "}
        <code>A1234-M1.jpg</code> (model).
      </>
    ),
  },
  {
    q: "A quote asks me to pick a sheet",
    a: <>The file has several tabs. Choose the one with the items.</>,
  },
  {
    q: "What is a catalog conflict?",
    a: <>A new quote disagrees with the catalog. The catalog value is kept until someone decides.</>,
  },
  {
    q: "Why isn't an item on Un-Verified Items?",
    a: <>Items appear once their quote is approved. Items already in the catalog aren&apos;t listed.</>,
  },
];

const INCLUDE = [
  "What you were doing",
  "What went wrong (a screenshot helps)",
  "The PO, item or page link",
];

export default async function HelpPage() {
  const session = await getSession();
  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  return (
    <AppShell activeHref="/help" eyebrow="Help" title="Help & Support">

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <Card>
            <h2 className="text-[0.95rem] mb-1 flex items-center gap-2">
              <MessageSquareText size={16} className="text-brand" /> Send a message
            </h2>
            <p className="text-[0.84rem] text-ink-soft mb-4">
              We&apos;ll reply to your email.
            </p>
            <SupportForm name={name} email={email} />
          </Card>

          <Card>
            <h2 className="text-[0.95rem] mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-brand" /> Common questions
            </h2>
            <div className="flex flex-col divide-y divide-[color:var(--border)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-3">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-[0.9rem] font-semibold text-ink">
                    {f.q}
                    <span className="text-brand font-mono text-[1rem] group-open:rotate-45 transition-transform duration-150">
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
              <span className="flex items-center justify-center w-11 h-11 rounded-full bg-brand-bg text-brand shrink-0">
                <Code2 size={20} />
              </span>
              <div>
                <div className="font-semibold text-[0.95rem]">{SUPPORT_CONTACT.name}</div>
                <div className="text-[0.8rem] text-ink-faint">{SUPPORT_CONTACT.role}, Alvik PIM</div>
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_CONTACT.email}?subject=${encodeURIComponent("Alvik PIM help")}`}
              className="flex items-center gap-2 text-[0.88rem] text-brand font-semibold no-underline break-all"
            >
              <Mail size={15} className="shrink-0" /> {SUPPORT_CONTACT.email}
            </a>
          </Card>

          <Card>
            <h2 className="text-[0.9rem] mb-2.5 flex items-center gap-2">
              <ListChecks size={15} className="text-brand" /> What to include
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
