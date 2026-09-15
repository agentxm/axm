/**
 * Effective per-agent lifecycle outcome for a configured extension.
 *
 * Workspace-state vocabulary: the plan pipeline, agent projection, and the
 * read-model inventory all report against this one shape.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";

export const ConfiguredAgentOutcomeSchema = Schema.Struct({
  extensionType: ExtensionTypeSchema,
  name: Schema.String,
  agentId: Schema.String,
  outcome: Schema.Literals([
    "projected",
    "current",
    "not-applicable",
    "unsupported",
    "blocked",
    "failed",
  ] as const),
  reasonCode: Schema.String,
  reason: Schema.String,
  mechanism: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
}).annotate({
  identifier: "ConfiguredAgentOutcome",
  title: "Configured Agent Outcome",
  description: "Effective lifecycle result for one configured agent and extension.",
});

export type ConfiguredAgentOutcome = typeof ConfiguredAgentOutcomeSchema.Type;
