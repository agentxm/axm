import type { Agent } from "@agentxm/extension-model/unstable/agent-capabilities";
import { installable } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { ConfiguredAgentOutcome } from "../plan/plan.js";
import type { HookManifest } from "@agentxm/extension-model/unstable/hooks/manifest-schema";

export interface HookOutcomeTarget {
  readonly nativePath?: string;
  readonly fallbackPath: string;
}

const nonAdvisoryDecision = (manifest: HookManifest): "block" | "modify" | undefined =>
  manifest.bindings
    .map((binding) => binding.requires?.decision.kind)
    .find((kind): kind is "block" | "modify" => kind === "block" || kind === "modify");

export const evaluateHookAgentOutcome = (args: {
  readonly agent: Agent;
  readonly manifest: HookManifest;
  readonly target: HookOutcomeTarget;
  readonly state: "projected" | "current";
}): ConfiguredAgentOutcome => {
  const unsupported = args.manifest.bindings
    .map((binding) => installable(args.agent, binding))
    .find((verdict) => !verdict.installable);

  if (unsupported === undefined) {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agentId: args.agent.id,
      outcome: args.state,
      reasonCode: "hook-native",
      reason: "All hook bindings have a supported native mapping and writer.",
      mechanism: "native",
      ...(args.target.nativePath === undefined ? {} : { path: args.target.nativePath }),
    };
  }

  if (args.manifest.fallback === "none") {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agentId: args.agent.id,
      outcome: "blocked",
      reasonCode: "hook-fallback-forbidden",
      reason: `${unsupported.reason} This hook forbids advisory fallback.`,
    };
  }

  const requiredDecision = nonAdvisoryDecision(args.manifest);
  if (requiredDecision !== undefined) {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agentId: args.agent.id,
      outcome: "blocked",
      reasonCode: "hook-decision-not-preserved",
      reason: `${unsupported.reason} Advisory fallback cannot preserve ${requiredDecision} decisions.`,
    };
  }

  return {
    extensionType: "hook",
    name: args.manifest.name,
    agentId: args.agent.id,
    outcome: args.state,
    reasonCode: "hook-advisory-fallback",
    reason: `${unsupported.reason} AXM will represent this observational hook through managed instructions.`,
    mechanism: "advisory-fallback",
    path: args.target.fallbackPath,
  };
};
