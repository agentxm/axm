/**
 * Render the per-change specification verdict for one proposed change.
 *
 * Usage:
 *   bun specification-verdict.ts [--base <revision>]
 *
 * Discovers specifications on both sides through project ownership — the
 * base revision's tracked tree and the working tree's project graph — keys
 * them by requirement identity, compares metadata, decisive examples, and
 * normalized bodies, then joins input-bound native runner receipts. An
 * optional `specifications/disposition-ledger.json` explains removals.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectCatalog, formatIssue } from "./specification-catalog-lib.js";
import {
  computeVerdict,
  parseDispositionLedger,
  renderVerdictMarkdown,
} from "./specification-verdict-lib.js";
import {
  captureEvidenceInputs,
  digestContent,
  readEvidenceRuns,
} from "./specification-evidence.js";
import {
  discoverExecutionBindings,
  discoverSpecifications,
  gitRefWorkspace,
  readWorkspace,
  runtimeOutputs,
} from "./workspace-discovery.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const DISPOSITION_LEDGER = "specifications/disposition-ledger.json";

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const resolveBaseRevision = (): string => {
  const explicitIndex = process.argv.indexOf("--base");
  const explicit = explicitIndex >= 0 ? process.argv[explicitIndex + 1] : undefined;
  if (explicit !== undefined) {
    return explicit;
  }
  for (const candidate of ["origin/main", "main"]) {
    try {
      return git("merge-base", candidate, "HEAD");
    } catch {
      continue;
    }
  }
  return "HEAD";
};

const baseRevision = git("rev-parse", "--verify", `${resolveBaseRevision()}^{commit}`);

// The base is accepted history; its discovery issues are not this change's to fix.
const baseSources = discoverSpecifications(gitRefWorkspace(baseRevision, repoRoot)).specifications;

const workspace = await readWorkspace();
const discovered = discoverSpecifications(workspace);
const bindings = discoverExecutionBindings(workspace);
const headCatalog = collectCatalog({
  repoRoot,
  specifications: discovered.specifications.map((entry) => entry.specification),
  executionBindings: bindings.bindings,
  issues: [...discovered.issues, ...bindings.issues],
});
if (headCatalog.issues.some((issue) => issue.severity === "error")) {
  throw new Error(
    `Cannot render a verdict for an invalid specification catalog:\n${headCatalog.issues
      .filter((issue) => issue.severity === "error")
      .map(formatIssue)
      .join("\n")}`,
  );
}
const headSources = discovered.specifications;

const evidence = readEvidenceRuns(repoRoot);
const evidenceIssues = [...evidence.issues];
const ledgerPath = path.join(repoRoot, DISPOSITION_LEDGER);
const ledger = fs.existsSync(ledgerPath)
  ? parseDispositionLedger(fs.readFileSync(ledgerPath, "utf8"))
  : { ledger: [], issues: [] };
evidenceIssues.push(...ledger.issues.map((issue) => `${DISPOSITION_LEDGER}: ${issue}`));

const changedFiles = [
  ...new Set([
    ...git("diff", "--name-only", "-z", baseRevision, "--").split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ]),
].filter(Boolean);
const specificationSources = new Set([
  ...baseSources.map((entry) => entry.specification.source),
  ...headSources.map((entry) => entry.specification.source),
]);
const sourceDigests = new Map([
  ...headSources.map((entry) => [entry.specification.source, entry.contentDigest] as const),
  ...headCatalog.executionBindings.map(
    (entry) =>
      [entry.source, digestContent(fs.readFileSync(path.join(repoRoot, entry.source)))] as const,
  ),
]);
const outputs = runtimeOutputs(workspace);
const verdict = computeVerdict(baseSources, headSources, {
  inputs: captureEvidenceInputs(repoRoot, { runtimeMode: "built", runtimeOutputs: outputs }),
  sourceInputs: captureEvidenceInputs(repoRoot, { runtimeMode: "source", runtimeOutputs: outputs }),
  runs: evidence.runs,
  executionBindings: headCatalog.executionBindings,
  sourceDigests,
  implementationChanges: changedFiles.filter((file) => !specificationSources.has(file)),
  issues: evidenceIssues,
  dispositions: ledger.ledger,
});
console.log(renderVerdictMarkdown(verdict));
