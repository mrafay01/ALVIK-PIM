const MONDAY_API_URL = process.env.MONDAY_API_URL ?? "https://api.monday.com/v2";

interface MondayResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export class MondayApiError extends Error {
  constructor(message: string, public readonly errors: { message: string }[]) {
    super(message);
    this.name = "MondayApiError";
  }
}

// Thin GraphQL wrapper — every board write in this app goes through here so
// there's one place that knows the auth header and the error-shape quirks
// of Monday's API (HTTP 200 with an `errors` array on failure).
export async function mondayRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not set");

  let res: Response;
  try {
    res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        "API-Version": "2024-10",
      },
      body: JSON.stringify({ query, variables }),
      // A stalled Monday call must not hold the request until the platform kills it.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new MondayApiError(timedOut ? "Monday didn't answer in time" : "Couldn't reach Monday", []);
  }

  // Rate limits and outages can answer with HTML or plain text, not JSON.
  const json = (await res.json().catch(() => null)) as MondayResponse<T> | null;
  if (!json) {
    throw new MondayApiError(
      res.status === 429 ? "Monday's rate limit was reached; try again in a minute" : `Monday answered with an error (${res.status})`,
      []
    );
  }
  if (json.errors?.length) {
    throw new MondayApiError(json.errors[0].message, json.errors);
  }
  if (!json.data) {
    throw new MondayApiError("Monday API returned no data", []);
  }
  return json.data;
}
