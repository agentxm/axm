import {
  type Agent,
  installable,
  isConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
import {
  type HookManifest,
  resolveHookImplementation,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";

export interface HookOutcomeTarget {
  readonly nativePath?: string;
}

/** Native settings are the only Hook activation mechanism. Runtime execution is separate evidence. */
export const evaluateHookAgentOutcome = (args: {
  readonly agent: Agent;
  readonly manifest: HookManifest;
  readonly target: HookOutcomeTarget;
  readonly scope: "project" | "user";
  readonly state: "projected" | "current";
}): ConfiguredAgentOutcome => {
  const base = { extensionType: "hook", name: args.manifest.name, agentId: args.agent.id } as const;
  if (args.target.nativePath === undefined || !isConfigurableAgentId(args.agent.id))
    return {
      ...base,
      outcome: "blocked",
      reasonCode: "hook-native-writer-unavailable",
      reason: "No native Hook writer is declared for the selected scope.",
    };
  const selected = resolveHookImplementation(args.manifest, args.agent.id, { scope: args.scope });
  if (selected.status === "unsupported")
    return {
      ...base,
      outcome: "blocked",
      reasonCode: "hook-native-implementation-unavailable",
      reason: selected.reasons.join(" "),
    };
  if (selected.status === "ambiguous")
    return {
      ...base,
      outcome: "blocked",
      reasonCode: "hook-native-implementation-ambiguous",
      reason: `Multiple implementations match: ${selected.implementationIds.join(", ")}.`,
    };
  const unsupported = selected.implementation.bindings
    .map((binding) => installable(args.agent, binding))
    .find((verdict) => !verdict.installable);
  if (unsupported !== undefined)
    return {
      ...base,
      outcome: "blocked",
      reasonCode: "hook-native-semantics-unsupported",
      reason: unsupported.reason,
    };
  return {
    ...base,
    outcome: args.state,
    reasonCode: selected.status === "conditional" ? "hook-native-conditional" : "hook-native",
    reason:
      `Native implementation ${selected.implementation.id} has a supported settings representation. ${selected.conditions.join(" ")} Runtime prerequisites and host execution remain unverified.`.replace(
        / +/g,
        " ",
      ),
    mechanism: "native",
    path: args.target.nativePath,
  };
};
