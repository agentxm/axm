/**
 * Generate JSON Schema files from Effect schemas.
 *
 * This script generates JSON Schema files for all manifest types,
 * settings, and lockfile schemas. The generated files are placed
 * in src/schemas/__generated__/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { JSONSchema } from "effect";
import { Lockfile } from "../src/schemas/lockfile.js";
import { CommandManifest } from "../src/schemas/manifest-command.js";
import { McpServerManifest } from "../src/schemas/manifest-mcp-server.js";
import { PackManifest } from "../src/schemas/manifest-pack.js";
import { SkillManifest } from "../src/schemas/manifest-skill.js";
import { Settings } from "../src/schemas/settings.js";

const OUTPUT_DIR = path.join(import.meta.dirname, "../src/schemas/__generated__");

const schemas = [
  { name: "axm-skill.schema.json", schema: SkillManifest },
  { name: "axm-command.schema.json", schema: CommandManifest },
  { name: "axm-pack.schema.json", schema: PackManifest },
  { name: "axm-mcp-server.schema.json", schema: McpServerManifest },
  { name: "settings.schema.json", schema: Settings },
  { name: "axm-lock.schema.json", schema: Lockfile },
];

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const { name, schema } of schemas) {
  const jsonSchema = JSONSchema.make(schema);
  const outputPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2) + "\n");
  console.log(`Generated: ${name}`);
}

console.log(`\nGenerated ${schemas.length} JSON schemas to ${OUTPUT_DIR}`);
