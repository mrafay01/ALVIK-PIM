"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { RouteProgress } from "@/components/app/RouteProgress";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* useSearchParams inside RouteProgress requires a Suspense boundary */}
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      {children}
    </SessionProvider>
  );
}
