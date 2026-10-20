"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

// router.refresh() returns immediately while the server re-renders the page
// in the background, so a save button that resets as soon as the request
// finishes looks idle while the old data is still on screen. Refreshing
// inside a transition keeps `refreshing` true until the new data is shown;
// callers fold it into their busy state.
export function useRefreshAfterSave(): { refresh: () => void; refreshing: boolean } {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  return { refresh, refreshing };
}
