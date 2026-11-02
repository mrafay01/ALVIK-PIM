// One commit (or delete) per quote at a time: Quotation.commitLockedAt is
// claimed atomically before either runs. A lock older than this counts as
// abandoned (the request crashed) and can be taken over.
export const COMMIT_LOCK_TTL_MS = 5 * 60 * 1000;

// Matches a quote nobody is committing or deleting right now.
export function commitLockFree(now: Date) {
  return {
    $or: [
      { commitLockedAt: null },
      { commitLockedAt: { $lt: new Date(now.getTime() - COMMIT_LOCK_TTL_MS) } },
    ],
  };
}
