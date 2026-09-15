import { NextResponse } from "next/server";

// Applies appropriate Cache-Control headers based on endpoint type.
// GET endpoints are safe to cache; mutation endpoints shouldn't be.

export function withCacheHeaders(response: NextResponse, cacheMaxAge: number = 0): NextResponse {
  if (cacheMaxAge > 0) {
    response.headers.set("Cache-Control", `public, max-age=${cacheMaxAge}, must-revalidate`);
  }
  return response;
}

// Cache durations (seconds)
export const CACHE_DURATIONS = {
  // Dashboard/analytics data: recompute frequently
  dashboard: 60,
  // Catalog data: stable, can cache longer
  catalog: 300,
  // List pages: mostly stable
  list: 120,
  // Detail pages: mostly stable
  detail: 300,
  // Transient data: don't cache
  transient: 0,
} as const;
