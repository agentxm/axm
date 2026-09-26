import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

/** The change the reconciliation recipe classified for one install. */
export type InstallChange = "created" | "updated" | "unchanged";

export interface SubagentProjectionObservation {
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

export interface SubagentInstallationFacts<E, Preparation> {
  readonly workspace: Effect.Effect<
    {
      readonly scope: "project" | "user";
      readonly placements: ReadonlyArray<
        { readonly agentId: string } & (
          | { readonly state: "supported" }
          | {
              readonly state: "unsupported" | "misconfigured" | "disabled";
              readonly reason: string;
            }
        )
      >;
    },
    E,
    Preparation
  >;
  /** The version the accepted resolution recorded before this install, if any. */
  readonly previousVersion: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<string | undefined, E, Preparation>;
}

export class SubagentPlacementUnavailable extends Data.TaggedError("SubagentPlacementUnavailable")<{
  readonly reason: string;
}> {}

/**
 * Subagents require every configured agent to support placement in a user
 * workspace. Whether an install changed anything is the reconciliation
 * recipe's classification; the presenter names the placements around it.
 */
export const prepareSubagentInstallations = <E, Preparation>(
  facts: SubagentInstallationFacts<E, Preparation>,
  entries: ReadonlyArray<{
    readonly ref: SubagentExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>,
) =>
  Effect.gen(function* () {
    const workspace = yield* facts.workspace;
    if (workspace.scope === "user") {
      const refused = workspace.placements.flatMap((placement) =>
        placement.state === "supported" ? [] : [`${placement.agentId}: ${placement.reason}`],
      );
      if (refused.length > 0)
        return yield* new SubagentPlacementUnavailable({
          reason: `Cannot install subagents for this user with the configured agent locations: ${refused.join("; ")}`,
        });
    }
    return yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function* () {
        const ref = entry.ref;
        const previousVersion = yield* facts.previousVersion(ref);
        const version = ref.refType === "registry" ? ref.version : undefined;
        return {
          ...entry,
          buildArtifact: (input: {
            readonly change: InstallChange;
            readonly observation: SubagentProjectionObservation;
          }) => {
            const targets = input.observation.targets.map(
              (target) => ({ ...target, change: input.change }) as const,
            );
            return {
              path: targets[0]?.path ?? ref.subagent.name,
              scope: workspace.scope,
              agents: input.observation.agents,
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
