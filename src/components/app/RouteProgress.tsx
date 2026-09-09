"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A top-of-page progress bar that starts the instant a navigation begins
// (on click, before Next.js has even started rendering the destination)
// and completes when the new route's content is in. loading.tsx skeletons
// cover the "what's happening" part once rendering starts; this covers the
// "did my click register" gap in between, the same pattern GitHub/YouTube
// use for exactly this reason.
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isFirstRender = useRef(true);

  // Start the bar the moment any in-app link is clicked — before the route
  // change is even detected below, so there's no gap after the click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Only same-origin in-app navigations trigger the bar.
      if (href.startsWith("http") && !href.startsWith(window.location.origin)) return;
      if (href === window.location.pathname + window.location.search) return;

      timers.current.forEach(clearTimeout);
      setVisible(true);
      setProgress(20);
      timers.current = [
        setTimeout(() => setProgress(55), 150),
        setTimeout(() => setProgress(78), 500),
      ];
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // The route actually changed — finish and hide the bar.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    timers.current.forEach(clearTimeout);
    setProgress(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
    return () => clearTimeout(hide);
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2.5px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-brass shadow-[0_0_8px_var(--brass-glow)] transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
