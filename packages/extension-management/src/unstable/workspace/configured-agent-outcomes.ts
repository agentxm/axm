import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { ConfiguredAgentOutcome } from "./configured-agent-outcome.js";
import type { WorkspaceScope } from "./scope.js";
import { setupScopeSupportOutcomes } from "./setup-scope-support.js";

export type ConfiguredAgentLifecycleState = "projected" | "current";

type ConfiguredAgentPolicy =
  | { readonly kind: "per-agent" }
  | { readonly kind: "workspace-capability" }
  | { readonly kind: "not-applicable"; readonly reasonCode: string; readonly reason: string };

/**
 * Exhaustive policy for interpreting configured agents for every extension
 * type. A new type cannot compile until its configured-agent semantics exist.
 */
export const EXTENSION_CONFIGURED_AGENT_POLICY = {
  skill: { kind: "per-agent" },
  "mcp-server": { kind: "per-agent" },
  subagent: { kind: "per-agent" },
  rule: { kind: "workspace-capability" },
  hook: { kind: "per-agent" },
  knowledge: {
    kind: "not-applicable",
    reasonCode: "workspace-owned",
    reason: "Knowledge bundles are workspace-owned and have no per-agent projection.",
  },
  pack: {
    kind: "not-applicable",
    reasonCode: "container-owned",
    reason: "Packs are lifecycle containers; their members own projection outcomes.",
  },
} as const satisfies Readonly<Record<ExtensionType, ConfiguredAgentPolicy>>;

const unsupportedOutcome = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly agentId: string;
  readonly reasonCode: string;
  readonly reason: string;
}): ConfiguredAgentOutcome => ({
  extensionType: args.type,
  name: args.name,
  agentId: args.agentId,
  outcome: "unsupported",
  reasonCode: args.reasonCode,
  reason: args.reason,
});

/** Derive stable configured-agent lifecycle outcomes from canonical capability facts. */
export const configuredAgentLifecycleOutcomes = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: WorkspaceScope;
  readonly state: ConfiguredAgentLifecycleState;
  readonly targetState: "enabled" | "disabled" | "absent";
  readonly installed: boolean;
  readonly observedAgentIds?: ReadonlyArray<string>;
  readonly applicableAgentIds?: ReadonlyArray<string>;
}): ReadonlyArray<ConfiguredAgentOutcome> => {
  const policy = EXTENSION_CONFIGURED_AGENT_POLICY[args.type];
  const observed = new Set(args.observedAgentIds ?? []);
  const applicable =
    args.applicableAgentIds === undefined ? undefined : new Set(args.applicableAgentIds);

  if (policy.kind === "not-applicable") {
    return args.agentIds.map((agentId) => ({
      extensionType: args.type,
      name: args.name,
      agentId,
      outcome: "not-applicable",
      reasonCode: policy.reasonCode,
      reason: policy.reason,
    }));
  }

  const supportByAgent = new Map(
    setupScopeSupportOutcomes(args.type, args.agentIds, args.scope).flatMap((outcome) =>
      outcome.agentId === undefined ? [] : [[outcome.agentId, outcome] as const],
    ),
  );

  return args.agentIds.map((agentId): ConfiguredAgentOutcome => {
    if (args.targetState !== "enabled") {
      return {
        extensionType: args.type,
        name: args.name,
        agentId,
        outcome: "not-applicable",
        reasonCode: args.targetState === "absent" ? "extension-absent" : "extension-disabled",
        reason:
          args.targetState === "absent"
            ? "The extension is absent, so no agent projection is expected."
            : "The extension is disabled, so no agent projection is expected.",
      };
    }
    if (applicable !== undefined && !applicable.has(agentId)) {
      return {
        extensionType: args.type,
        name: args.name,
        agentId,
        outcome: "not-applicable",
        reasonCode: "target-policy-excluded",
        reason: `${agentId} is excluded by the extension target policy.`,
      };
    }

    const support = supportByAgent.get(agentId);
    if (support === undefined) {
      return unsupportedOutcome({
        type: args.type,
        name: args.name,
        agentId,
        reasonCode: "unknown-agent",
        reason: `${agentId} is not present in the coding-agent capability catalog.`,
      });
    }
    if (support.status !== "supported") {
      return unsupportedOutcome({
        type: args.type,
        name: args.name,
        agentId,
        reasonCode: support.reasonCode,
        reason: support.reason,
      });
    }

    const workspaceProjection = policy.kind === "workspace-capability";
    if (
      args.state === "current" &&
      (!args.installed || (!workspaceProjection && !observed.has(agentId)))
    ) {
      return {
        extensionType: args.type,
        name: args.name,
        agentId,
        outcome: "failed",
        reasonCode: args.installed ? "projection-missing" : "extension-missing",
        reason: args.installed
          ? `The expected ${agentId} projection is missing.`
          : "The configured extension is not installed.",
      };
    }

    return {
      extensionType: args.type,
      name: args.name,
      agentId,
      outcome: args.state,
      reasonCode: "supported",
      reason: support.reason,
    };
  });
};
