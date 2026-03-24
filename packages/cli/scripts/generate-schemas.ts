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
import * as Schema from "effect/Schema";
import {
  CommandManifestSchema,
  McpServerManifestSchema,
  PackManifestSchema,
  SkillManifestSchema,
} from "@axm.sh/core/unstable/extensions";
import { LockfileSchema } from "@axm.sh/core/unstable/lockfile";
import { SettingsSchema } from "@axm.sh/core/unstable/settings";

const CLI_SRC = path.join(import.meta.dirname, "../src");
const CORE_SRC = path.join(import.meta.dirname, "../../core/src/unstable");

interface SchemaConfig {
  name: string;
  schema: Schema.Top;
  outputDir: string;
}

const schemas: SchemaConfig[] = [
  {
    name: "axm-lock.schema.json",
    schema: LockfileSchema,
    outputDir: path.join(CORE_SRC, "lockfile/__generated__"),
  },
  {
    name: "settings.schema.json",
    schema: SettingsSchema,
    outputDir: path.join(CORE_SRC, "settings/__generated__"),
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

let count = 0;

const toDraft07SchemaFile = (schema: Schema.Top) => {
  const document = JSONSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema));

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
  console.log(`Generated: ${path.relative(CLI_SRC, outputPath)}`);
  count++;
}

console.log(`\nGenerated ${count} JSON schemas`);
