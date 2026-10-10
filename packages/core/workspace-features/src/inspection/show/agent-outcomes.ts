import * as Schema from "effect/Schema";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import { ConfiguredAgentOutcomeSchema } from "@agentxm/workspace-kernel/operations";

/** Show details extend the same per-agent outcome reported by plans and lists. */
export const ShowAgentOutcomeSchema = Schema.Struct({
  ...ConfiguredAgentOutcomeSchema.fields,
  fields: Schema.optionalKey(Schema.Array(Schema.String)),
  warnings: Schema.optionalKey(Schema.Array(Schema.String)),
  configuration: Schema.optionalKey(Schema.Literals(["valid", "blocked", "unverified"])),
  projection: Schema.optionalKey(Schema.String),
  readiness: Schema.optionalKey(Schema.Literals(["blocked", "unverified"])),
  runtime: Schema.optionalKey(Schema.Literal("not-checked")),
  manualActions: Schema.optionalKey(Schema.Array(Schema.String)),
});

export type ShowAgentOutcome = typeof ShowAgentOutcomeSchema.Type;

export const filterShowAgentOutcomes = (args: {
  readonly outcomes: ReadonlyArray<ShowAgentOutcome>;
  readonly requested: ReadonlyArray<string>;
  readonly configured: ReadonlyArray<string>;
  readonly type: ExtensionType;
  readonly name: string;
}): ReadonlyArray<ShowAgentOutcome> => {
  if (args.requested.length === 0) return args.outcomes;
  return [
    ...args.outcomes.filter((outcome) => args.requested.includes(outcome.agentId)),
    ...[...new Set(args.requested)]
      .filter(
        (agentId) =>
          !args.configured.includes(agentId) &&
          !args.outcomes.some((outcome) => outcome.agentId === agentId),
      )
      .map((agentId): ShowAgentOutcome => ({
        extensionType: args.type,
        name: args.name,
        agentId,
        outcome: "not-applicable",
        reasonCode: "agent-not-configured",
        reason: "This agent is not configured in the selected scope.",
        configuration: "unverified",
        projection: "not-configured",
        readiness: "blocked",
        runtime: "not-checked",
        manualActions: ["Configure the agent in this scope before projecting the extension."],
      })),
  ];
};
