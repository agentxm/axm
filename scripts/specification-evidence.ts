/** Native runner evidence. This is a receipt for an execution, never acceptance. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export const digestContent = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const InputSnapshot = Schema.Struct({
  sourceDigest: Schema.NonEmptyString,
  runtimeDigest: Schema.NonEmptyString,
  revision: Schema.NonEmptyString,
});
const FileEvidence = Schema.Struct({
  source: Schema.NonEmptyString,
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
  format: Schema.Literal(1),
  suite: Schema.NonEmptyString,
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
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? outputFiles(repoRoot, relative) : [relative];
  });
};

/**
 * Conservative repository-wide invalidation is deliberate: no inferred import
 * graph can establish every file read by repository and command specifications.
 * Built workspace packages are separate runtime inputs because tests load dist.
 * node_modules is represented by the lockfile, assuming a frozen installation.
 */
export const captureEvidenceInputs = (repoRoot: string): EvidenceInputs => {
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
  const packagesPath = path.join(repoRoot, "packages");
  const runtimeFiles = fs.existsSync(packagesPath)
    ? fs.readdirSync(packagesPath).flatMap((name) => outputFiles(repoRoot, `packages/${name}/dist`))
    : [];
  return {
    sourceDigest: digestFiles(repoRoot, sources),
    runtimeDigest: digestFiles(repoRoot, runtimeFiles),
    revision: git("rev-parse", "HEAD").trim(),
  };
};

export const sameEvidenceInputs = (left: EvidenceInputs, right: EvidenceInputs): boolean =>
  left.sourceDigest === right.sourceDigest && left.runtimeDigest === right.runtimeDigest;

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
