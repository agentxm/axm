import {
  resolveHookImplementation,
  type HookImplementationContext,
} from "@agentxm/extension-model/unstable/hooks/resolution";
import * as Result from "effect/Result";
import {
  type Agent,
  isConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { ConfiguredAgentOutcome, HookEvidenceStatus } from "../../operations/index.js";
import {
  resolveHookConfiguration,
  type HookConfigurationValues,
  type HookManifest,
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
  readonly configuration?: HookConfigurationValues;
  readonly fixtureEvidence?: HookEvidenceStatus;
  readonly host?: Omit<HookImplementationContext, "scope">;
}): ConfiguredAgentOutcome => {
  const base = { extensionType: "hook", name: args.manifest.name, agentId: args.agent.id } as const;
  if (args.target.nativePath === undefined || !isConfigurableAgentId(args.agent.id))
    return {
      ...base,
      outcome: "blocked",
      reasonCode: "hook-native-writer-unavailable",
      reason: "No native Hook writer is declared for the selected scope.",
    };
  const selected = resolveHookImplementation(args.manifest, args.agent.id, {
    ...args.host,
    scope: args.scope,
  });
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
  const configuration = resolveHookConfiguration(args.manifest, args.configuration ?? {});
  const nativeImport = args.manifest.metadata?.["nativeImport"];
  const duplicateRisk =
    typeof nativeImport === "object" &&
    nativeImport !== null &&
    "originalRegistrationsPreserved" in nativeImport &&
    nativeImport["originalRegistrationsPreserved"] === true;
  const conditions = [
    ...selected.conditions,
    ...(duplicateRisk
      ? [
          "Import preserved the original native registrations; enabling this package can execute the hook twice until those originals are removed.",
        ]
      : []),
  ];
  return {
    ...base,
    outcome: args.state,
    reasonCode: selected.status === "conditional" ? "hook-native-conditional" : "hook-native",
    reason:
      `Native implementation ${selected.implementation.id} has a supported settings representation. ${conditions.join(" ")} Runtime prerequisites and host execution remain unverified.`.replace(
        / +/g,
        " ",
      ),
    mechanism: "native",
    path: args.target.nativePath,
    hook: {
      implementationId: selected.implementation.id,
      protocol: selected.implementation.protocol,
      bindings: selected.implementation.bindings.map((binding) => ({
        id: binding.id,
        event: binding.event,
        ...(binding.matcher === undefined ? {} : { matcher: binding.matcher }),
        runtime: binding.handler.runtime,
        entrypoint: binding.handler.entrypoint,
        requiredOutcomes: binding.requires?.outcomes ?? [],
        requiredOperations: binding.requires?.operations ?? [],
      })),
      conditions,
      configuration: {
        status:
          args.configuration === undefined
            ? "not-evaluated"
            : Result.isFailure(configuration)
              ? "invalid"
              : "valid",
        fields:
          args.configuration === undefined
            ? []
            : Object.entries(args.manifest.configuration ?? {}).map(([key, field]) => {
                const consumer = Object.hasOwn(args.configuration ?? {}, key);
                const value = consumer ? args.configuration?.[key] : field.default;
                const redacted = field.type === "string" && field.secret === true;
                return {
                  key,
                  source: consumer ? "consumer" : field.default === undefined ? "unset" : "default",
                  value: redacted || typeof value === "object" ? null : (value ?? null),
                  redacted,
                };
              }),
        issues:
          args.configuration !== undefined && Result.isFailure(configuration)
            ? configuration.failure
            : [],
      },
      runtimeAvailability: "unverified",
      nativeInvocation: "not-observed",
      fixtureEvidence: args.fixtureEvidence ?? {
        state: "absent",
        reason: "No local fixture evidence was evaluated for this selection",
      },
    },
  };
};
