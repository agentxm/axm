/**
 * Render the per-change specification verdict for one proposed change.
 *
 * Usage:
 *   bun specification-verdict.ts [--base <revision>]
 *
 * Compares specification metadata and content between the base revision
 * (default: merge-base with origin/main, falling back to main) and the
 * working tree, then joins current suite evidence from
 * test-results/specifications/junit.xml.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectCatalog, parseSpecificationFile } from "./specification-catalog-lib.js";
import {
  computeVerdict,
  digestContent,
  parseJunitOutcomes,
  renderVerdictMarkdown,
  type VerdictSource,
} from "./specification-verdict-lib.js";

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

const baseRevision = resolveBaseRevision();

const baseSources: VerdictSource[] = [];
const listBaseFiles = (): string[] => {
  try {
    return git("ls-tree", "-r", "--name-only", baseRevision, "--", "specifications/")
      .split("\n")
      .filter((file) => file.endsWith(".spec.ts"));
  } catch {
    return [];
  }
};
const baseFiles = listBaseFiles();
for (const file of baseFiles) {
  let content: string;
  try {
    content = execFileSync("git", ["show", `${baseRevision}:${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch {
    continue;
  }
  const parsed = parseSpecificationFile(content, file);
  if (parsed.specification !== undefined) {
    baseSources.push({
      specification: parsed.specification,
      contentDigest: digestContent(content),
    });
  }
}

const headCatalog = collectCatalog({ repoRoot });
const headSources: VerdictSource[] = headCatalog.specifications.map((specification) => ({
  specification,
  contentDigest: digestContent(fs.readFileSync(path.join(repoRoot, specification.source), "utf8")),
}));

const junitPath = path.join(repoRoot, "test-results", "specifications", "junit.xml");
const junitOutcomes = fs.existsSync(junitPath)
  ? parseJunitOutcomes(fs.readFileSync(junitPath, "utf8"))
  : new Map();

const verdict = computeVerdict(baseSources, headSources, junitOutcomes);
console.log(renderVerdictMarkdown(verdict));
