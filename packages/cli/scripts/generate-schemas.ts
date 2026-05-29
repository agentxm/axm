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
import { McpServerManifestSchema } from "../../core/src/unstable/mcps/index.js";
import { SubagentManifestSchema } from "../../core/src/unstable/subagents/index.js";
import { PackManifestSchema } from "../../core/src/unstable/packs/index.js";
import { ContextManifestSchema } from "../../core/src/unstable/context/index.js";
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
    name: "subagent.schema.json",
    schema: SubagentManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "pack.schema.json",
    schema: PackManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "context.schema.json",
    schema: ContextManifestSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
  {
    name: "axm-package-meta.schema.json",
    schema: AxmPackageMetaSchema,
    outputDir: SITE_CONTENT_SCHEMAS_DIR,
  },
];

let count = 0;

// effect-smol always emits `patternProperties` for `Schema.Record(KeyWithPattern, Value)`.
// For the single-pattern shape that Record always produces, `propertyNames` + `additionalProperties`
// is more idiomatic and also matches Record's strict runtime semantics — keys not matching the
// pattern are rejected, whereas bare `patternProperties` (without `additionalProperties: false`)
// silently allows them. When the key pattern matches a named definition, point `propertyNames`
// at it via `$ref` so the schema reads as "keys are NonPackExtensionFqn" rather than repeating
// the regex.
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findDefinitionPattern = (definition: unknown): string | undefined => {
  if (!isJsonObject(definition)) return undefined;
  if (typeof definition["pattern"] === "string") return definition["pattern"];
  const allOf = definition["allOf"];
  if (Array.isArray(allOf)) {
    for (const entry of allOf) {
      const found = findDefinitionPattern(entry);
      if (found !== undefined) return found;
    }
  }
  return undefined;
};

const buildPatternRefIndex = (definitions: Record<string, unknown>): Map<string, string> => {
  const index = new Map<string, string>();
  for (const [name, def] of Object.entries(definitions)) {
    const pattern = findDefinitionPattern(def);
    if (pattern !== undefined && !index.has(pattern)) {
      index.set(pattern, `#/definitions/${name}`);
    }
  }
  return index;
};

const rewritePatternProperties = (node: unknown, patternRefs: Map<string, string>): unknown => {
  if (Array.isArray(node)) {
    return node.map((item) => rewritePatternProperties(item, patternRefs));
  }
  if (!isJsonObject(node)) {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = rewritePatternProperties(value, patternRefs);
  }
  const pp = out["patternProperties"];
  const collapsable =
    isJsonObject(pp) &&
    out["additionalProperties"] === undefined &&
    out["propertyNames"] === undefined &&
    out["properties"] === undefined;
  if (collapsable) {
    const entries = Object.entries(pp);
    if (entries.length === 1) {
      const entry = entries[0];
      if (entry !== undefined) {
        const [pattern, valueSchema] = entry;
        const ref = patternRefs.get(pattern);
        delete out["patternProperties"];
        out["propertyNames"] = ref !== undefined ? { $ref: ref } : { pattern };
        out["additionalProperties"] = valueSchema;
      }
    }
  }
  return out;
};

const toDraft07SchemaFile = (schema: Schema.Top) => {
  const document = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema));

  const file = {
    $comment:
      "@generated by core:generate:schemas (packages/cli/scripts/generate-schemas.ts). Regenerate: pnpm exec nx run core:generate:schemas. DO NOT EDIT.",
    $schema: "http://json-schema.org/draft-07/schema#",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { definitions: document.definitions } : {}),
  };

  return rewritePatternProperties(file, buildPatternRefIndex(document.definitions));
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
