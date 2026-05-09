/**
 * Command manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { AGENT_IDS } from "../agents/types.js";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

/**
 * Filename for command manifest files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const COMMAND_MANIFEST_FILENAME = "command.json";

/**
 * URL for the command manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const COMMAND_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/command.schema.json";

const AGENT_OVERRIDE_KEY_PATTERN = new RegExp(`^(?:${AGENT_IDS.join("|")})$`);

const AgentOverrideKeySchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(AGENT_OVERRIDE_KEY_PATTERN, {
      message: "Expected a supported agent id.",
    }),
  ),
);

/**
 * Schema for command manifest files (command.json).
 *
 * Commands provide executable CLI functionality that can be
 * registered and invoked through the AXM CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("command"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "command name is required" }),
    Schema.annotate({
      description:
        "Short name for this command within its owner namespace. Combined with owner, forms the FQN @owner/commands/<name>.",
    }),
  ),
  agentOverrides: Schema.optional(
    Schema.Record(
      AgentOverrideKeySchema,
      Schema.Record(Schema.String, Schema.Unknown).annotate({
        description:
          "Frontmatter fields to override for this agent. Keys are frontmatter field names; values replace the matching fields when this command is consumed by the agent.",
      }),
    ).annotate({
      description:
        "Per-agent frontmatter overrides keyed by agent id (e.g. claude-code, cursor). Values are the frontmatter fields to override for that agent.",
    }),
  ),
}).annotate({
  identifier: "CommandManifest",
  title: "Command Manifest",
  description:
    "Extension manifest file for slash-command. Carries the registry-facing identity, version, and metadata, plus optional per-agent frontmatter overrides.",
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = Schema.Schema.Type<typeof CommandManifestSchema>;
