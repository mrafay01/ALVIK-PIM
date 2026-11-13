// Browser side of the sliced Master File commit (Review page and Flagged
// Items): the server commits for ~40 s per call and returns `next` while
// rows are left, so this keeps calling with `after: next` until it's done.

export interface SlicedCommitTotal {
  committed: number;
  created: number;
  merged: number;
  errors: { rowId: string; message: string }[];
  // Why the run stopped before the end (server error / unreachable), if it did.
  failed: string | null;
}

export async function commitInSlices(
  url: string,
  body: Record<string, unknown>,
  onProgress?: (sum: SlicedCommitTotal) => void
): Promise<SlicedCommitTotal> {
  const sum: SlicedCommitTotal = { committed: 0, created: 0, merged: 0, errors: [], failed: null };
  let after: string | undefined;
  do {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, after }),
      });
    } catch {
      sum.failed = "Couldn't reach the server.";
      return sum;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      sum.failed = data.error ?? "That didn't work.";
      return sum;
    }
    sum.committed += data.committed ?? 0;
    sum.created += data.created ?? 0;
    sum.merged += data.merged ?? 0;
    sum.errors.push(...((data.errors ?? []) as SlicedCommitTotal["errors"]));
    after = typeof data.next === "string" ? data.next : undefined;
    if (after) onProgress?.(sum);
  } while (after);
  return sum;
}

// The message shown after a commit run.
export function commitSummary(total: SlicedCommitTotal, mergedLabel: string): { tone: "good" | "critical"; text: string } {
  const errs = total.errors;
  if (total.failed && total.committed === 0 && errs.length === 0) {
    return { tone: "critical", text: `${total.failed} Try again.` };
  }
  return {
    tone: errs.length || total.failed ? "critical" : "good",
    text:
      `Committed ${total.committed.toLocaleString()} row(s) to the catalog: ${total.created.toLocaleString()} new, ` +
      `${total.merged.toLocaleString()} ${mergedLabel}.` +
      (errs.length ? ` ${errs.length} couldn't be committed: ${errs.slice(0, 2).map((e) => e.message).join("; ")}` : "") +
      (total.failed ? ` It stopped before the end (${total.failed}); commit again to finish the rest.` : ""),
  };
}
