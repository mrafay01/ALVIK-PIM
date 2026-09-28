"use client";

// Route-segment error boundary. Any unhandled error thrown while rendering
// a page (a DB connection failure in a Server Component, a bad query, etc.)
// lands here instead of a blank 500 with a stack trace. The real error is
// logged server-side by Next.js; the user just sees a recoverable message.

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in the browser console for local debugging; the server
    // side is already logged by the framework.
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-sunken p-5">
      <Card className="max-w-[420px] text-center">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-critical-bg text-critical mb-3.5">
          <TriangleAlert size={20} />
        </span>
        <h1 className="text-lg mb-2">Something went wrong</h1>
        <p className="text-ink-soft text-sm mb-[18px]">
          This screen couldn&apos;t load. It&apos;s usually temporary; try again in a
          moment.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
          <Button onClick={() => (window.location.href = "/dashboard")}>Back to Dashboard</Button>
        </div>
      </Card>
    </main>
  );
}
