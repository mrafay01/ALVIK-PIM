export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@/lib/sentry");
    initSentry();
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
