/** The per-item outcome facts recovery selection reads. */
export interface PublishRecoveryItem {
  readonly id: string;
  readonly status: string;
  readonly reason?: string;
}

export const publishRecoverySelection = (
  results: ReadonlyArray<PublishRecoveryItem>,
): {
  readonly remainingItems: ReadonlyArray<string>;
  readonly blockedDependents: ReadonlyArray<string>;
} => ({
  // The continuation set covers everything not definitively published:
  // failures, blocked dependents, indeterminate uploads (the re-run verifies
  // byte-identical versions before retrying), and interrupted pending items.
  remainingItems: results
    .filter(
      (result) =>
        result.status === "failed" ||
        result.status === "blocked" ||
        result.status === "unknown" ||
        (result.status === "pending" && result.reason === "interrupted"),
    )
    .map((result) => result.id),
  blockedDependents: results
    .filter((result) => result.status === "blocked")
    .map((result) => result.id),
});
