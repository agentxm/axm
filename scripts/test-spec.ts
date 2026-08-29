/**
 * Run executable specifications, optionally selected by stable requirement
 * identity, then enforce the fast-suite performance budget.
 *
 * Usage:
 *   bun test-spec.ts                                   # full specification suite
 *   bun test-spec.ts --requirement <id> [<id> ...]     # exactly the evidence for these requirements
 *   bun test-spec.ts --class <requirement-class>       # every specification of one concern
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { checkSpecificationBudget } from "./check-spec-budget-lib.js";
import { collectCatalog } from "./specification-catalog-lib.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const rawArguments = process.argv.slice(2);
const classIndex = rawArguments.indexOf("--class");
const selectedClass = classIndex >= 0 ? rawArguments[classIndex + 1] : undefined;
const requirementIds = rawArguments.filter(
  (argument, index) =>
    argument !== "--requirement" && argument !== "--class" && index !== classIndex + 1,
);

const selectedSources: string[] = [];
if (selectedClass !== undefined) {
  const catalog = collectCatalog({ repoRoot });
  const matching = catalog.specifications.filter(
    (entry) => entry.requirementClass === selectedClass,
  );
  if (matching.length === 0) {
    console.log(`No specifications with class "${selectedClass}" are registered.`);
    process.exit(0);
  }
  for (const specification of matching) {
    selectedSources.push(path.relative("specifications", specification.source));
  }
} else if (requirementIds.length > 0) {
  const catalog = collectCatalog({ repoRoot });
  for (const requirementId of requirementIds) {
    const specification = catalog.specifications.find(
      (entry) => entry.requirement === requirementId,
    );
    if (specification === undefined) {
      console.error(`Unknown requirement identity: ${requirementId}`);
      console.error("Known identities are listed in specifications/catalog.md.");
      process.exit(1);
    }
    selectedSources.push(path.relative("specifications", specification.source));
  }
}

const nxArguments = ["exec", "nx", "run", "specifications:test", "--outputStyle=static"];
if (selectedSources.length > 0) {
  nxArguments.push(`--args=${selectedSources.join(" ")}`);
}

const run = spawnSync("pnpm", nxArguments, { cwd: repoRoot, stdio: "inherit" });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

// The budget binds the complete fast suite; a selected subset always fits.
if (selectedSources.length === 0) {
  const budget = checkSpecificationBudget(repoRoot);
  if (budget.kind === "over-budget") {
    console.error(budget.message);
    process.exit(1);
  }
  console.log(budget.message);
}
