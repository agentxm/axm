/**
 * Regenerate the catalog-derived extension type enumerations embedded in
 * hand-written Markdown.
 *
 * Adding a row to the extension type table changes every file listed below, so
 * `generate:check` fails on a catalog change that has not been carried into the
 * docs. Regions are narrow on purpose — tables and enumerations only, never
 * whole paragraphs — so the surrounding prose stays hand-written.
 */

/* eslint-disable @nx/enforce-module-boundaries -- Generator must read core source so committed docs cannot drift behind stale dist output. */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — build-time documentation generation script, not Effect code
import * as fs from "node:fs";
import * as path from "node:path";
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";

import {
  EXTENSION_TYPE_TABLE,
  extensionTypes,
  type ExtensionType,
} from "../../core/src/unstable/extensions/common.js";
import { EXTENSION_TYPES_BY_ID } from "../../core/src/unstable/extension-types/catalog.js";
import { CATALOG_EXTENSION_TYPES } from "../../core/src/unstable/extension-types/schema.js";
import {
  buildRegionBlocks,
  rewriteManagedRegions,
  type TypeEnumerationRow,
} from "./type-enumerations.js";

const CLI_ROOT = path.join(import.meta.dirname, "..");
const WORKSPACE_ROOT = path.join(CLI_ROOT, "../..");

const TARGET_FILES = [
  "README.md",
  "packages/cli/README.md",
  "packages/cli/help/topics/getting-started.md",
  "packages/cli/help/topics/basic-usage.md",
  ".axm/extensions/@agentxm/skills/axm/src/SKILL.md",
];

const catalogTypes: ReadonlySet<string> = new Set(CATALOG_EXTENSION_TYPES);

const isCatalogType = (
  type: ExtensionType,
): type is ExtensionType & keyof typeof EXTENSION_TYPES_BY_ID => catalogTypes.has(type);

const rows: ReadonlyArray<TypeEnumerationRow> = extensionTypes.map((type) => {
  const row = EXTENSION_TYPE_TABLE[type];
  const definition = isCatalogType(type) ? EXTENSION_TYPES_BY_ID[type] : undefined;
  return {
    plural: row.plural,
    pluralLabel: row.pluralLabel,
    pluralSentenceLabel: row.pluralSentenceLabel,
    summary: definition?.summary ?? null,
    standard: definition?.standard ?? null,
  };
});

const blocks = buildRegionBlocks(rows);

const prettierFor = async (filePath: string, content: string): Promise<string> => {
  const config = (await resolvePrettierConfig(filePath)) ?? {};
  return formatWithPrettier(content, { ...config, filepath: filePath, parser: "markdown" });
};

let changed = 0;
for (const relativePath of TARGET_FILES) {
  const filePath = path.join(WORKSPACE_ROOT, relativePath);
  const source = fs.readFileSync(filePath, "utf-8");
  const { content, regions } = rewriteManagedRegions(source, blocks);
  if (regions.length === 0) {
    throw new Error(`${relativePath} declares no axm:generated region`);
  }
  const formatted = await prettierFor(filePath, content);
  if (formatted !== source) {
    fs.writeFileSync(filePath, formatted);
    changed += 1;
  }
}

console.log(`Generated: extension type enumerations in ${TARGET_FILES.length} files`);
if (changed > 0) console.log(`Rewrote: ${changed} file(s)`);
