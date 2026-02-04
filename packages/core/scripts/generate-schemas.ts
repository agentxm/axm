/**
 * Generate JSON Schema files from Effect schemas.
 *
 * This script generates JSON Schema files for all manifest types,
 * settings, and lockfile schemas. The generated files are placed
 * in src/schemas/__generated__/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as JSONSchema from "effect/JSONSchema";
import { LockfileSchema } from "../src/experimental/schemas/lockfile.js";
import { CommandManifestSchema } from "../src/experimental/schemas/manifest-command.js";
import { McpServerManifestSchema } from "../src/experimental/schemas/manifest-mcp-server.js";
import { PackManifestSchema } from "../src/experimental/schemas/manifest-pack.js";
import { SkillManifestSchema } from "../src/experimental/schemas/manifest-skill.js";
import { SettingsSchema } from "../src/experimental/schemas/settings.js";

const OUTPUT_DIR = path.join(import.meta.dirname, "../src/experimental/schemas/__generated__");

const schemas = [
  { name: "axm-skill.schema.json", schema: SkillManifestSchema },
  { name: "axm-command.schema.json", schema: CommandManifestSchema },
  { name: "axm-pack.schema.json", schema: PackManifestSchema },
  { name: "axm-mcp-server.schema.json", schema: McpServerManifestSchema },
  { name: "settings.schema.json", schema: SettingsSchema },
  { name: "axm-lock.schema.json", schema: LockfileSchema },
];

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const { name, schema } of schemas) {
  const jsonSchema = JSONSchema.make(schema);
  const outputPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outputPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);
  console.log(`Generated: ${name}`);
}

console.log(`\nGenerated ${schemas.length} JSON schemas to ${OUTPUT_DIR}`);
