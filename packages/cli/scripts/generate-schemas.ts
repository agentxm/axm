/**
 * Generate JSON Schema files from Effect schemas.
 *
 * This script generates JSON Schema files for all manifest types,
 * settings, and lockfile schemas. The published public schema surface
 * lives under `packages/core/site-content/schemas`, so generation
 * writes there directly instead of scattering files across package
 * internals and re-exporting them one by one.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";
import { SkillManifestSchema } from "@axm.sh/core/unstable/skills";
import { CommandManifestSchema } from "@axm.sh/core/unstable/commands";
import { McpServerManifestSchema } from "@axm.sh/core/unstable/mcp-servers";
import { ExtensionPackManifestSchema } from "@axm.sh/core/unstable/packs";
import { LockfileSchema } from "@axm.sh/core/unstable/lockfile";
import { SettingsSchema } from "@axm.sh/core/unstable/settings";

const CLI_ROOT = path.join(import.meta.dirname, "..");
const CORE_ROOT = path.join(import.meta.dirname, "../../core");
const SITE_CONTENT_SCHEMAS_DIR = path.join(CORE_ROOT, "site-content/__generated__/schemas");

interface SchemaConfig {
  name: string;
  schema: Schema.Top;
  outputDir: string;
}

const schemas: SchemaConfig[] = [
  {
    name: "axm-lock.schema.json",
    schema: LockfileSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "settings.schema.json",
    schema: SettingsSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-skill.schema.json",
    schema: SkillManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-command.schema.json",
    schema: CommandManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-mcp-server.schema.json",
    schema: McpServerManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-pack.schema.json",
    schema: ExtensionPackManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
];

let count = 0;

const toDraft07SchemaFile = (schema: Schema.Top) => {
  const document = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema));

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { definitions: document.definitions } : {}),
  };
};

for (const { name, schema, outputDir } of schemas) {
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonSchema = toDraft07SchemaFile(schema);
  const outputPath = path.join(outputDir, name);
  fs.writeFileSync(outputPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);
  console.log(`Generated: ${path.relative(CLI_ROOT, outputPath)}`);
  count++;
}

console.log(`\nGenerated ${count} JSON schemas`);
