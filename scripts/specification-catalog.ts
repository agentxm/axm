/**
 * Generate and validate the specification catalog.
 *
 * Usage:
 *   bun specification-catalog.ts            # validate metadata, write specifications/catalog.md
 *   bun specification-catalog.ts --check    # validate metadata and catalog freshness only
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectCatalog, formatIssue, renderCatalogMarkdown } from "./specification-catalog-lib.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const catalogPath = path.join(repoRoot, "specifications", "catalog.md");
const checkOnly = process.argv.includes("--check");

const catalog = collectCatalog({ repoRoot });

const errors = catalog.issues.filter((issue) => issue.severity === "error");
const warnings = catalog.issues.filter((issue) => issue.severity === "warning");

for (const warning of warnings) {
  console.error(formatIssue(warning));
}
if (errors.length > 0) {
  for (const error of errors) {
    console.error(formatIssue(error));
  }
  console.error(`Specification catalog validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const rendered = renderCatalogMarkdown(catalog);

if (checkOnly) {
  const existing = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, "utf8") : "";
  if (existing !== rendered) {
    console.error(
      "specifications/catalog.md is stale. Run `pnpm run generate` and commit the result.",
    );
    process.exit(1);
  }
  console.log(
    `Specification catalog is fresh: ${catalog.specifications.length} specification(s), ${catalog.productGoals.length} product goal(s).`,
  );
  process.exit(0);
}

fs.writeFileSync(catalogPath, rendered);
console.log(
  `Wrote specifications/catalog.md: ${catalog.specifications.length} specification(s), ${catalog.productGoals.length} product goal(s), ${catalog.executionBindings.length} execution binding(s).`,
);
