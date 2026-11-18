"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/support";

export function SupportForm({ name, email }: { name: string; email: string }) {
  const [topic, setTopic] = useState<SupportTopic>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, subject, message, pageUrl: pageUrl.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send your message.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-good font-semibold">
          <CheckCircle2 size={18} /> Message sent
        </div>
        <p className="text-[0.88rem] text-ink-soft m-0">
          Thanks, {name.split(" ")[0] || "there"}. The reply will come to <strong>{email}</strong>.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setSent(false);
            setSubject("");
            setMessage("");
            setPageUrl("");
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-3.5 flex-wrap">
        <Field label="What's it about?" width={240}>
          <Select value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
            {SUPPORT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex-1 min-w-[220px]">
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Can't upload a PI file"
              maxLength={150}
              required
            />
          </Field>
        </div>
      </div>
      <Field label="Message">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          required
          placeholder="What happened?"
          className="font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full resize-y focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-glow)]"
        />
      </Field>
      <Field label="Page it happened on (optional)">
        <Input
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="Paste the address from the browser bar, e.g. a PO or item link"
          maxLength={300}
        />
      </Field>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" variant="primary" loading={sending}>
          <span className="flex items-center gap-1.5">
            {!sending && <Send size={14} />} {sending ? "Sending…" : "Send message"}
          </span>
        </Button>
        <span className="text-[0.8rem] text-ink-faint">
          Sent as {name} ({email}); replies come to that address.
        </span>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
