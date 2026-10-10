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
import { NativeUnitReferenceSchema } from "../locations/index.js";
import { HookEvidenceStatusSchema } from "./hook-evidence.js";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";

export const ConfiguredAgentReasonCodeSchema = Schema.Literals([
  "supported",
  "no-configured-agents",
  "unknown-agent",
  "native-capability-unavailable",
  "axm-capability-unavailable",
  "project-only",
  "scope-not-modeled",
  "container-owned",
  "extension-absent",
  "extension-disabled",
  "extension-missing",
  "projection-missing",
  "verified-native-unit",
  "native-projection-not-current",
  "native-content-conflict",
  "native-location-unverified",
  "native-observation-unavailable",
  "planned-native-unit",
  "no-applicable-native-unit",
  "plan-step-blocked",
  "managed-region-absent",
  "managed-region-complete",
  "managed-region-malformed",
  "managed-region-unsupported-version",
  "hook-native-writer-unavailable",
  "hook-native-implementation-unavailable",
  "hook-native-implementation-ambiguous",
  "hook-native-conditional",
  "hook-native",
  "stale-projection",
  "mcp-unmanaged",
  "mcp-unsupported",
  "mcp-unverified",
  "mcp-blocked",
  "subagent-implementation-unavailable",
  "subagent-native-writer-unavailable",
  "subagent-native-layout-unavailable",
  "subagent-portable-instructions-unavailable",
  "subagent-runtime-reference-unresolved",
  "subagent-native-proof-unavailable",
  "subagent-native-render-unavailable",
  "subagent-placement-disabled",
  "subagent-placement-misconfigured",
  "subagent-placement-unsupported",
  "subagent-placement-unverified",
  "subagent-native-implementation",
  "agent-not-configured",
]).annotate({
  identifier: "ConfiguredAgentReasonCode",
  description: "Published reasons for a configured-agent lifecycle outcome.",
});

export type ConfiguredAgentReasonCode = typeof ConfiguredAgentReasonCodeSchema.Type;

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
  reasonCode: ConfiguredAgentReasonCodeSchema,
  reason: Schema.String,
  mechanism: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  nativeUnits: Schema.optional(Schema.Array(NativeUnitReferenceSchema)),
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
