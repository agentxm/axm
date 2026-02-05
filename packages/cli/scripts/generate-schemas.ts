/**
 * Generate JSON Schema files from Effect schemas.
 *
 * This script generates JSON Schema files for all manifest types,
 * settings, and lockfile schemas. Each generated file is placed
 * in a `__generated__/` folder next to its source file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as JSONSchema from "effect/JSONSchema";
import { LockfileSchema } from "../src/workspace/lockfile-schema.js";
import { SettingsSchema } from "../src/workspace/settings-schema.js";
import { SkillManifestSchema } from "../src/extensions/skills/manifest-schema.js";
import { CommandManifestSchema } from "../src/extensions/commands/manifest-schema.js";
import { McpServerManifestSchema } from "../src/extensions/mcp-servers/manifest-schema.js";
import { PackManifestSchema } from "../src/extensions/packs/manifest-schema.js";

const CLI_SRC = path.join(import.meta.dirname, "../src");

const schemas = [
  {
    name: "axm-lock.schema.json",
    schema: LockfileSchema,
    outputDir: path.join(CLI_SRC, "workspace/__generated__"),
  },
  {
    name: "settings.schema.json",
    schema: SettingsSchema,
    outputDir: path.join(CLI_SRC, "workspace/__generated__"),
  },
  {
    name: "axm-skill.schema.json",
    schema: SkillManifestSchema,
    outputDir: path.join(CLI_SRC, "extensions/skills/__generated__"),
  },
  {
    name: "axm-command.schema.json",
    schema: CommandManifestSchema,
    outputDir: path.join(CLI_SRC, "extensions/commands/__generated__"),
  },
  {
    name: "axm-mcp-server.schema.json",
    schema: McpServerManifestSchema,
    outputDir: path.join(CLI_SRC, "extensions/mcp-servers/__generated__"),
  },
  {
    name: "axm-pack.schema.json",
    schema: PackManifestSchema,
    outputDir: path.join(CLI_SRC, "extensions/packs/__generated__"),
  },
];

let generatedCount = 0;

for (const { name, schema, outputDir } of schemas) {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonSchema = JSONSchema.make(schema);
  const outputPath = path.join(outputDir, name);
  fs.writeFileSync(outputPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);
  console.log(`Generated: ${path.relative(CLI_SRC, outputPath)}`);
  generatedCount++;
}

console.log(`\nGenerated ${generatedCount} JSON schemas`);
