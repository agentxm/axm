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
          "Frontmatter field overrides applied when materializing the command for this agent. Keys are frontmatter field names; values replace the matching fields in the command's `<name>.md` content file.",
      }),
    ).annotate({
      description:
        "Per-agent frontmatter overrides applied when this command is materialized for a specific coding agent. Keys are agent ids (e.g. claude-code, cursor); values are the field overrides for that agent.",
    }),
  ),
}).annotate({
  identifier: "CommandManifest",
  title: "Command Manifest",
  description:
    "Slash-command extension manifest (command.json). The prompt body lives in `<name>.md` (e.g., `review-pr.md`) alongside this file and is materialized into each supported coding agent's commands directory.",
});

/**
 * Inferred type for CommandManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandManifest = Schema.Schema.Type<typeof CommandManifestSchema>;
