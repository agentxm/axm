// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — deterministic build-time generation.
import * as fs from "node:fs";
import * as path from "node:path";

import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";

import { makeAgentCatalogReference } from "./agent-catalog-reference.js";

const cliRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  cliRoot,
  "site-content/__generated__/agent-catalog/agent-catalog.json",
);
const prettierConfig = (await resolvePrettierConfig(outputPath)) ?? {};
const formatted = await formatWithPrettier(JSON.stringify(makeAgentCatalogReference(AGENTS)), {
  ...prettierConfig,
  filepath: outputPath,
  parser: "json",
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, formatted);
console.log(`Generated: ${path.relative(cliRoot, outputPath)}`);
