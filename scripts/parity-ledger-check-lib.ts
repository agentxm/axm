/**
 * The parity exemption ledger is shrink-only: rows tagged `seed: true` existed
 * when the ledger was introduced, and their count may never rise relative to
 * `main`. A new parity gap therefore cannot be admitted as pre-existing debt —
 * it either fails the conformance suites or lands as an explicitly un-seeded
 * row that reviewers see for what it is.
 */

const SEED_ROW_PATTERN = /\bseed:\s*true\b/g;

export const countSeededRows = (ledgerSource: string): number =>
  Array.from(ledgerSource.matchAll(SEED_ROW_PATTERN)).length;

export type LedgerCheckResult =
  | { readonly ok: true; readonly current: number; readonly baseline: number | undefined }
  | { readonly ok: false; readonly current: number; readonly baseline: number };

export const checkLedgerShrinkOnly = (
  currentSource: string,
  baselineSource: string | undefined,
): LedgerCheckResult => {
  const current = countSeededRows(currentSource);
  if (baselineSource === undefined) {
    return { ok: true, current, baseline: undefined };
  }
  const baseline = countSeededRows(baselineSource);
  return current > baseline ? { ok: false, current, baseline } : { ok: true, current, baseline };
};
