/**
 * Render the per-change specification verdict for one proposed change.
 *
 * Usage:
 *   bun specification-verdict.ts [--base <revision>]
 *
 * Compares specification metadata and content between the base revision
 * (default: merge-base with origin/main, falling back to main) and the
 * working tree, then joins input-bound native runner receipts.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectCatalog, parseSpecificationFile } from "./specification-catalog-lib.js";
import {
  computeVerdict,
  renderVerdictMarkdown,
  type VerdictSource,
} from "./specification-verdict-lib.js";
import {
  captureEvidenceInputs,
  digestContent,
  readEvidenceRuns,
} from "./specification-evidence.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

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

const baseSources: VerdictSource[] = [];
const baseFiles = git("ls-tree", "-r", "--name-only", baseRevision, "--", "specifications/")
  .split("\n")
  .filter((file) => file.endsWith(".spec.ts"));
for (const file of baseFiles) {
  const content = execFileSync("git", ["show", `${baseRevision}:${file}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = parseSpecificationFile(content, file);
  if (parsed.specification !== undefined) {
    baseSources.push({
      specification: parsed.specification,
      contentDigest: digestContent(content),
    });
  }
}

const headCatalog = collectCatalog({ repoRoot });
if (headCatalog.issues.length > 0) {
  throw new Error(
    `Cannot render a verdict for an invalid specification catalog:\n${headCatalog.issues.map((issue) => issue.message).join("\n")}`,
  );
}
const headSources: VerdictSource[] = headCatalog.specifications.map((specification) => ({
  specification,
  contentDigest: digestContent(fs.readFileSync(path.join(repoRoot, specification.source), "utf8")),
}));

const evidence = readEvidenceRuns(repoRoot);
const changedFiles = [
  ...new Set([
    ...git("diff", "--name-only", "-z", baseRevision, "--").split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ]),
].filter(Boolean);
const sourceDigests = new Map([
  ...headSources.map((entry) => [entry.specification.source, entry.contentDigest] as const),
  ...headCatalog.executionBindings.map(
    (entry) =>
      [entry.source, digestContent(fs.readFileSync(path.join(repoRoot, entry.source)))] as const,
  ),
]);
const verdict = computeVerdict(baseSources, headSources, {
  inputs: captureEvidenceInputs(repoRoot),
  runs: evidence.runs,
  executionBindings: headCatalog.executionBindings,
  sourceDigests,
  implementationChanges: changedFiles.filter(
    (file) => !file.startsWith("specifications/") || !file.endsWith(".spec.ts"),
  ),
  issues: evidence.issues,
});
console.log(renderVerdictMarkdown(verdict));
