import type { Agent } from "../agent-capabilities/index.js";
import { installable } from "../agent-capabilities/index.js";
import type { ConfiguredAgentOutcome } from "../plan/plan.js";
import type { HookManifest } from "./manifest-schema.js";

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
}): ConfiguredAgentOutcome => {
  const unsupported = args.manifest.bindings
    .map((binding) => installable(args.agent, binding))
    .find((verdict) => !verdict.installable);

  if (unsupported === undefined) {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agent: args.agent.id,
      outcome: "native",
      reason: "All hook bindings have a supported native mapping and writer.",
      ...(args.target.nativePath === undefined ? {} : { path: args.target.nativePath }),
    };
  }

  if (args.manifest.fallback === "none") {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agent: args.agent.id,
      outcome: "blocked",
      reason: `${unsupported.reason} This hook forbids advisory fallback.`,
    };
  }

  const requiredDecision = nonAdvisoryDecision(args.manifest);
  if (requiredDecision !== undefined) {
    return {
      extensionType: "hook",
      name: args.manifest.name,
      agent: args.agent.id,
      outcome: "blocked",
      reason: `${unsupported.reason} Advisory fallback cannot preserve ${requiredDecision} decisions.`,
    };
  }

  return {
    extensionType: "hook",
    name: args.manifest.name,
    agent: args.agent.id,
    outcome: "advisory-fallback",
    reason: `${unsupported.reason} AXM will represent this observational hook through managed instructions.`,
    path: args.target.fallbackPath,
  };
};
