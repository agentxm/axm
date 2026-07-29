/**
 * Shrink-only enforcement for the extension-type parity exemption ledger.
 *
 * The conformance suites already keep the ledger honest about the *present*:
 * they fail when a type stops meeting an obligation without a row, and when a
 * row outlives the gap it described. Neither can stop the ledger from growing —
 * a new gap admitted as a seeded row reads exactly like pre-existing debt.
 *
 * This check compares the current seeded-row count against the merge base and
 * fails when it rises, so debt can only be paid down. New rows are still
 * allowed; they just cannot claim to have been there all along.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const LEDGER_PATH = "packages/core/src/unstable/extension-types/parity/exemptions.ts";

/**
 * A `seed: true` marker, which only rows present at ledger introduction carry.
 *
 * Anchored to its own line: the ledger is prettier-formatted, so a real marker
 * always occupies one, while prose mentioning `seed: true` — including this
 * file's own documentation of the flag — never does.
 */
const SEED_MARKER = /^\s*seed:\s*true\s*,?\s*$/gm;

export const countSeedRows = (source: string): number =>
  Array.from(source.matchAll(SEED_MARKER)).length;

export interface LedgerComparison {
  readonly baseline: number | null;
  readonly current: number;
  readonly baselineRef: string | null;
}

export interface LedgerCheckResult {
  readonly ok: boolean;
  readonly message: string;
  readonly comparison: LedgerComparison;
}

const git = (repoRoot: string, args: ReadonlyArray<string>): string | null => {
  try {
    return execFileSync("git", [...args], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * The commit to compare against: the merge base with the default branch, or the
 * branch tip when no merge base is reachable (shallow clone, fresh worktree).
 * Returns `null` when neither is available, which the caller reports as a
 * skipped comparison rather than a failure.
 */
export const resolveBaselineRef = (repoRoot: string): string | null => {
  for (const branch of ["origin/main", "main"]) {
    const mergeBase = git(repoRoot, ["merge-base", "HEAD", branch])?.trim();
    if (mergeBase !== undefined && mergeBase.length > 0) {
      return mergeBase;
    }
    const tip = git(repoRoot, ["rev-parse", "--verify", branch])?.trim();
    if (tip !== undefined && tip.length > 0) {
      return tip;
    }
  }
  return null;
};

/** The ledger as of `ref`, or `null` when the file does not exist there. */
export const readLedgerAt = (repoRoot: string, ref: string): string | null =>
  git(repoRoot, ["show", `${ref}:${LEDGER_PATH}`]);

export const checkParityLedger = (repoRoot: string): LedgerCheckResult => {
  const currentPath = path.join(repoRoot, LEDGER_PATH);
  if (!fs.existsSync(currentPath)) {
    return {
      ok: false,
      message: `Parity exemption ledger not found at ${LEDGER_PATH}.`,
      comparison: { baseline: null, current: 0, baselineRef: null },
    };
  }

  const current = countSeedRows(fs.readFileSync(currentPath, "utf-8"));
  const baselineRef = resolveBaselineRef(repoRoot);

  if (baselineRef === null) {
    return {
      ok: true,
      message:
        `No baseline branch is reachable, so the ledger could not be compared. ` +
        `Current seeded rows: ${current}.`,
      comparison: { baseline: null, current, baselineRef: null },
    };
  }

  const baselineSource = readLedgerAt(repoRoot, baselineRef);
  if (baselineSource === null) {
    return {
      ok: true,
      message:
        `The ledger does not exist at ${baselineRef.slice(0, 12)}; treating this as its first ` +
        `landing. Current seeded rows: ${current}.`,
      comparison: { baseline: null, current, baselineRef },
    };
  }

  const baseline = countSeedRows(baselineSource);
  const comparison: LedgerComparison = { baseline, current, baselineRef };

  if (current > baseline) {
    return {
      ok: false,
      message:
        `The parity exemption ledger grew: ${baseline} seeded rows at ` +
        `${baselineRef.slice(0, 12)}, ${current} now. Seeded rows record debt that predates the ` +
        `ledger, so a new gap must be fixed rather than admitted. Fix the obligation, or add the ` +
        `row without \`seed: true\` if it is genuinely new and tracked.`,
      comparison,
    };
  }

  return {
    ok: true,
    message:
      current < baseline
        ? `Parity exemption ledger shrank: ${baseline} seeded rows to ${current}.`
        : `Parity exemption ledger unchanged at ${current} seeded rows.`,
    comparison,
  };
};
