import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

/** The change the reconciliation recipe classified for one install. */
export type InstallChange = "created" | "updated" | "unchanged";

export interface SubagentProjectionObservation<NativeLocation, AgentOutcome> {
  readonly nativeLocations?: ReadonlyArray<NativeLocation>;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes?: ReadonlyArray<AgentOutcome>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

export interface SubagentInstallationFacts<E, Preparation> {
  readonly workspace: Effect.Effect<
    {
      readonly scope: "project" | "user";
    },
    E,
    Preparation
  >;
  /** The version the accepted resolution recorded before this install, if any. */
  readonly previousVersion: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<string | undefined, E, Preparation>;
}

/** Present the placements and support outcomes of a materialized installation. */
export const prepareSubagentInstallations = <E, Preparation>(
  facts: SubagentInstallationFacts<E, Preparation>,
  entries: ReadonlyArray<{
    readonly ref: SubagentExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>,
) =>
  Effect.gen(function* () {
    const workspace = yield* facts.workspace;
    return yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function* () {
        const ref = entry.ref;
        const previousVersion = yield* facts.previousVersion(ref);
        const version = ref.refType === "registry" ? ref.version : undefined;
        return {
          ...entry,
          buildArtifact: <NativeLocation, AgentOutcome>(input: {
            readonly change: InstallChange;
            readonly observation: SubagentProjectionObservation<NativeLocation, AgentOutcome>;
          }) => {
            const targets = input.observation.targets.map(
              (target) => ({ ...target, change: input.change }) as const,
            );
            return {
              path: targets[0]?.path ?? ref.subagent.name,
              scope: workspace.scope,
              agents: input.observation.agents,
              ...(input.observation.agentOutcomes === undefined
                ? {}
                : { agentOutcomes: input.observation.agentOutcomes }),
              ...(input.observation.nativeLocations === undefined
                ? {}
                : { nativeLocations: input.observation.nativeLocations }),
              ...(version === undefined ? {} : { version }),
              ...(previousVersion !== undefined && previousVersion !== version
                ? { previousVersion }
                : {}),
              ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
            } as const;
          },
        };
      }),
    );
  });
