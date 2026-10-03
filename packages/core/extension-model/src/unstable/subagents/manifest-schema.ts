/** Subagent packages declare portable instructions and explicit native implementations. */
import * as Schema from "effect/Schema";
import { AgentIdSchema } from "../agent-capabilities/identity.js";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

/**
 * Filename for subagent manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MANIFEST_FILENAME = "subagent.json";

/**
 * URL for the subagent manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/subagent.schema.json";

/** A contained, portable package file reference, never a URL or host path. */
export const SubagentSourcePathSchema = Schema.String.check(
  Schema.isPattern(/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[^\\\p{Cc}:]+$/u),
  Schema.makeFilter((value) => !value.endsWith("/"), {
    message: "Expected a contained package-relative file path",
    toJsonSchema: () => ({ not: { pattern: "/$" } }),
  }),
).annotate({
  description: "Package-relative regular file path; traversal and host paths are forbidden.",
});

/** Native names are file stems and need not equal the package identity. */
export const SubagentNativeNameSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
).annotate({ description: "Native agent name, independent of the AXM package name." });

const safeConfigurationKey = Schema.String.check(
  Schema.isPattern(
    /^(?!(?:name|description|instructions|developer_instructions|prompt|systemPrompt|system_prompt|roleDefinition|agentOverrides|fallback|__proto__|prototype|constructor)$).+$/,
  ),
);

export const SubagentConfigurationSchema = Schema.Record(Schema.String, Schema.Json)
  .check(Schema.isPropertyNames(safeConfigurationKey))
  .annotate({
    description:
      "Opaque native configuration; identity and instruction fields belong to the core or a complete native implementation.",
  });

export const SubagentCoreSchema = Schema.Struct({
  instructions: SubagentSourcePathSchema,
  name: Schema.optional(SubagentNativeNameSchema),
});

export const SubagentImplementationSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("customized"),
    source: Schema.optional(Schema.Never),
    configuration: Schema.optional(SubagentConfigurationSchema),
    instructions: Schema.optional(
      Schema.Struct({
        mode: Schema.Literals(["append", "replace"]),
        source: SubagentSourcePathSchema,
      }),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("native"),
    source: SubagentSourcePathSchema,
    configuration: Schema.optional(Schema.Never),
    instructions: Schema.optional(Schema.Never),
  }),
]);

export const SubagentManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  enhances: NonPackManifestFields.enhances,
  requires: NonPackManifestFields.requires,
  recommendedPacks: NonPackManifestFields.recommendedPacks,
  standalone: NonPackManifestFields.standalone,
  type: Schema.Literal("subagent"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "subagent name is required" }),
    Schema.annotate({
      description:
        "Short name for this subagent within its owner namespace. Combined with owner, forms the FQN @owner/subagents/<name>.",
    }),
  ),
  core: Schema.optional(SubagentCoreSchema),
  implementations: Schema.optional(
    Schema.Record(Schema.String, SubagentImplementationSchema).check(
      Schema.isPropertyNames(AgentIdSchema),
    ),
  ),
  // Reject obsolete contracts even at readers that otherwise discard excess fields.
  fallback: Schema.optional(Schema.Never),
  agentOverrides: Schema.optional(Schema.Never),
  agents: Schema.optional(Schema.Never),
})
  .check(
    Schema.makeFilter(
      (manifest) => {
        const implementations = Object.values(manifest.implementations ?? {});
        if (manifest.core === undefined) {
          if (implementations.some((implementation) => implementation.kind === "customized")) {
            return "A customized implementation requires a portable core";
          }
          if (!implementations.some((implementation) => implementation.kind === "native")) {
            return "A subagent requires a portable core or at least one native implementation";
          }
        } else if (manifest.description === undefined || manifest.description.trim().length === 0) {
          return "A portable core requires a nonempty manifest description";
        }
        return true;
      },
      {
        toJsonSchema: () => ({
          anyOf: [
            {
              required: ["core", "description"],
              properties: { description: { type: "string", pattern: "\\S" } },
            },
            {
              not: { required: ["core"] },
              required: ["implementations"],
              properties: {
                implementations: {
                  minProperties: 1,
                  additionalProperties: { properties: { kind: { const: "native" } } },
                },
              },
            },
          ],
        }),
      },
    ),
  )
  .annotate({
    identifier: "SubagentManifest",
    title: "Subagent Manifest",
    description:
      "One subagent package with portable instructions, explicit per-agent customization, or complete native implementations.",
  });

/**
 * Inferred type for SubagentManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentManifest = Schema.Schema.Type<typeof SubagentManifestSchema>;
export type SubagentImplementation = Schema.Schema.Type<typeof SubagentImplementationSchema>;
