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
import { HookEvidenceStatusSchema } from "./hook-evidence.js";
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
  nativeUnitKeys: Schema.optional(Schema.Array(Schema.String)),
  hook: Schema.optionalKey(
    Schema.Struct({
      implementationId: Schema.String,
      protocol: Schema.String,
      bindings: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          event: Schema.String,
          matcher: Schema.optionalKey(Schema.String),
          runtime: Schema.String,
          entrypoint: Schema.String,
          requiredOutcomes: Schema.Array(Schema.String),
          requiredOperations: Schema.Array(Schema.String),
        }),
      ),
      conditions: Schema.Array(Schema.String),
      configuration: Schema.Struct({
        status: Schema.Literals(["valid", "invalid", "not-evaluated"]),
        fields: Schema.Array(
          Schema.Struct({
            key: Schema.String,
            source: Schema.Literals(["consumer", "default", "unset"]),
            value: Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
            redacted: Schema.Boolean,
          }),
        ),
        issues: Schema.Array(Schema.Struct({ key: Schema.String, message: Schema.String })),
      }),
      runtimeAvailability: Schema.Literal("unverified"),
      nativeInvocation: Schema.Literal("not-observed"),
      fixtureEvidence: HookEvidenceStatusSchema,
    }),
  ),
}).annotate({
  identifier: "ConfiguredAgentOutcome",
  title: "Configured Agent Outcome",
  description: "Effective lifecycle result for one configured agent and extension.",
});

export type ConfiguredAgentOutcome = typeof ConfiguredAgentOutcomeSchema.Type;
