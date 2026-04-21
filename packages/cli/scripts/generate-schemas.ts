/**
 * Generate JSON Schema files from Effect schemas.
 *
 * This script generates JSON Schema files for all manifest types,
 * settings, and lockfile schemas. The published public schema surface
 * lives under `packages/core/site-content/schemas`, so generation
 * writes there directly instead of scattering files across package
 * internals and re-exporting them one by one.
 */

/* eslint-disable @nx/enforce-module-boundaries -- Generator must read core source schemas directly so committed site-content cannot drift behind stale dist output. */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — build-time schema generation script, not Effect code
import * as fs from "node:fs";
import * as path from "node:path";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";
import { SkillManifestSchema } from "../../core/src/unstable/skills/index.js";
import { CommandManifestSchema } from "../../core/src/unstable/commands/index.js";
import { McpServerManifestSchema } from "../../core/src/unstable/mcp-servers/index.js";
import { ExtensionPackManifestSchema } from "../../core/src/unstable/packs/index.js";
import { LockfileSchema } from "../../core/src/unstable/lockfile/index.js";
import { AxmPackageMetaSchema } from "../../core/src/unstable/packaging/index.js";
import { SettingsSchema } from "../../core/src/unstable/settings/index.js";

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
    name: "skill.schema.json",
    schema: SkillManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "command.schema.json",
    schema: CommandManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "mcp-server.schema.json",
    schema: McpServerManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "extension-pack.schema.json",
    schema: ExtensionPackManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-package-meta.schema.json",
    schema: AxmPackageMetaSchema,
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
  const prettierConfig = (await resolvePrettierConfig(outputPath)) ?? {};
  const formattedJsonSchema = await formatWithPrettier(JSON.stringify(jsonSchema), {
    ...prettierConfig,
    filepath: outputPath,
    parser: "json",
  });
  fs.writeFileSync(outputPath, formattedJsonSchema);
  console.log(`Generated: ${path.relative(CLI_ROOT, outputPath)}`);
  count++;
}

console.log(`\nGenerated ${count} JSON schemas`);
