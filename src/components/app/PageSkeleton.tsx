// Shown automatically by Next.js while a route segment's server component
// (AppShell's session lookup + the page's own DB query) is still resolving —
// picked up via each route's loading.tsx. Mirrors AppShell's real layout
// (sidebar rail + header + content) so the page doesn't visibly jump once
// the real content swaps in.

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-sm bg-surface-overlay animate-pulse ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-[248px] shrink-0 border-r border-border bg-surface flex flex-col px-3 py-5">
        <div className="flex items-center gap-2.5 pb-6 px-1">
          <Bone className="w-[34px] h-[34px] rounded-sm shrink-0" />
          <Bone className="w-20 h-4" />
        </div>
        <div className="flex flex-col gap-2 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-9" />
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="px-10 py-5 border-b border-border bg-surface">
          <Bone className="h-3 w-24 mb-2.5" />
          <Bone className="h-7 w-48" />
        </header>

        <main className="px-10 pt-8 pb-16">
          <Bone className="h-4 w-full max-w-[68ch] mb-2" />
          <Bone className="h-4 w-2/3 max-w-[50ch] mb-8" />

          <div className="grid grid-cols-4 gap-3.5 mb-7">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-[86px]" />
            ))}
          </div>

          <Bone className="h-64 w-full" />
        </main>
      </div>
    </div>
  );
}
