/** Native runner evidence. This is a receipt for an execution, never acceptance. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { expandOutputs } from "nx/src/native";

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { TEST_PURPOSES } from "./test-purpose.js";

export const digestContent = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const ExecutionTarget = Schema.Struct({
  project: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
  configuration: Schema.optionalKey(Schema.NonEmptyString),
});
const InputSnapshot = Schema.Struct({
  sourceDigest: Schema.NonEmptyString,
  runtimeDigest: Schema.NonEmptyString,
  runtimeMode: Schema.Literals(["source", "built"]),
  revision: Schema.NonEmptyString,
  runtimeResolved: Schema.Boolean,
});
/**
 * The purpose a file executed under, as labelled by the shared purpose setup
 * during execution. `unlabelled` records that no purpose reached the
 * receipt, so a specification run without its labelling is never a pass.
 */
export const RECEIPT_PURPOSES = [...TEST_PURPOSES, "unlabelled"] as const;
const FileEvidence = Schema.Struct({
  source: Schema.NonEmptyString,
  /** Nx project whose test target executed the file. */
  owner: Schema.NonEmptyString,
  purpose: Schema.Literals(RECEIPT_PURPOSES),
  contentDigest: Schema.NonEmptyString,
  tests: count,
  passed: count,
  failed: count,
  skipped: count,
  pending: count,
  moduleFailed: Schema.Boolean,
  filtered: Schema.Boolean,
});
export const EvidenceRunSchema = Schema.Struct({
  format: Schema.Literal(3),
  suite: Schema.NonEmptyString,
  task: Schema.NullOr(ExecutionTarget),
  startedAt: Schema.NonEmptyString,
  finishedAt: Schema.NonEmptyString,
  inputs: InputSnapshot,
  inputsStable: Schema.Boolean,
  environment: Schema.Struct({
    node: Schema.NonEmptyString,
    platform: Schema.NonEmptyString,
    architecture: Schema.NonEmptyString,
  }),
  selection: Schema.Array(Schema.String),
  complete: Schema.Boolean,
  unhandledErrors: count,
  files: Schema.Array(FileEvidence),
});
export type EvidenceRun = typeof EvidenceRunSchema.Type;
export type EvidenceFile = typeof FileEvidence.Type;
export type EvidenceInputs = typeof InputSnapshot.Type;
export type ReceiptPurpose = EvidenceFile["purpose"];

export const parseEvidenceRun = (text: string): EvidenceRun | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const decoded = Schema.decodeUnknownResult(EvidenceRunSchema)(value);
  if (Result.isFailure(decoded)) return undefined;
  if (
    decoded.success.files.some(
      (file) => file.tests !== file.passed + file.failed + file.skipped + file.pending,
    )
  )
    return undefined;
  return decoded.success;
};

/** Content, modes, links, additions and deletions participate in the identity. */
export const digestFiles = (repoRoot: string, files: readonly string[]): string => {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(`${file}\0`);
    const absolute = path.join(repoRoot, file);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        hash.update("missing\0");
        continue;
      }
      throw error;
    }
    hash.update(`${stat.mode}\0`);
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(absolute));
    else if (stat.isFile()) hash.update(fs.readFileSync(absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const outputFiles = (repoRoot: string, directory: string): string[] => {
  const absolute = path.join(repoRoot, directory);
  if (!fs.existsSync(absolute)) return [];
  if (!fs.statSync(absolute).isDirectory()) return [directory];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? outputFiles(repoRoot, relative) : [relative];
  });
};

export interface EvidenceInputOptions {
  readonly runtimeMode?: EvidenceInputs["runtimeMode"];
  /**
   * Prerequisite outputs resolved by Nx for the actual execution target.
   * Undefined means resolution failed, never an empty-but-verified runtime.
   * Ignored in source mode.
   */
  readonly runtimeOutputs: readonly string[] | undefined;
}

/**
 * Conservative repository-wide invalidation is deliberate: no inferred import
 * graph can establish every file read by repository and command specifications.
 * Built runtime outputs are separate inputs because built-mode tests load
 * them; Nx resolves the actual target's prerequisite outputs, so unrelated
 * compilation does not invalidate the receipt. node_modules is represented by the lockfile, assuming a
 * frozen installation.
 */
export const captureEvidenceInputs = (
  repoRoot: string,
  { runtimeMode = "built", runtimeOutputs }: EvidenceInputOptions,
): EvidenceInputs => {
  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: repoRoot,
      // A Git hook supplies repository selectors such as GIT_DIR. The
      // caller-selected root must own this observation even inside a hook.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
      ),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  const sources = git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean);
  const runtimeFiles =
    runtimeMode === "source"
      ? sources
      : expandOutputs(repoRoot, [...(runtimeOutputs ?? [])]).flatMap((output) =>
          outputFiles(repoRoot, output),
        );
  return {
    sourceDigest: digestFiles(repoRoot, sources),
    runtimeDigest: digestContent(
      JSON.stringify({
        outputs: runtimeMode === "source" ? [] : [...new Set(runtimeOutputs ?? [])].sort(),
        files: digestFiles(repoRoot, runtimeFiles),
      }),
    ),
    runtimeMode,
    runtimeResolved:
      runtimeMode === "source" || (runtimeOutputs !== undefined && runtimeOutputs.length > 0),
    revision: git("rev-parse", "HEAD").trim(),
  };
};

export const sameEvidenceInputs = (left: EvidenceInputs, right: EvidenceInputs): boolean =>
  left.runtimeResolved &&
  right.runtimeResolved &&
  left.sourceDigest === right.sourceDigest &&
  left.runtimeDigest === right.runtimeDigest &&
  left.runtimeMode === right.runtimeMode;

export const readEvidenceRuns = (
  repoRoot: string,
): {
  readonly runs: readonly EvidenceRun[];
  readonly issues: readonly string[];
} => {
  const directory = path.join(repoRoot, "test-results");
  if (!fs.existsSync(directory)) return { runs: [], issues: [] };
  const runs: EvidenceRun[] = [];
  const issues: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const receipt = path.join(directory, entry.name, "evidence.json");
    if (!fs.existsSync(receipt)) continue;
    const run = parseEvidenceRun(fs.readFileSync(receipt, "utf8"));
    if (run === undefined)
      issues.push(`Invalid execution evidence: test-results/${entry.name}/evidence.json`);
    else runs.push(run);
  }
  return { runs, issues };
};
