import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

export interface SubagentProjectionObservation {
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

export interface SubagentInstallationFacts<E, Preparation, Execution> {
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
  readonly inspect: (ref: SubagentExtensionRef) => Effect.Effect<
    {
      readonly previousVersion: string | undefined;
      readonly sourceHash: string | undefined;
    },
    E,
    Preparation
  >;
  readonly isInstalled: (ref: SubagentExtensionRef) => Effect.Effect<boolean, E, Execution>;
  readonly readContentIdentity: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<string | undefined, E, Execution>;
}

export class SubagentPlacementUnavailable extends Data.TaggedError("SubagentPlacementUnavailable")<{
  readonly reason: string;
}> {}

/** Subagents require every configured agent to support placement in a user workspace. */
export const prepareSubagentInstallations = <E, Preparation, Execution>(
  facts: SubagentInstallationFacts<E, Preparation, Execution>,
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
        const before = yield* facts.inspect(ref);
        const version = ref.refType === "registry" ? ref.version : undefined;
        return {
          ...entry,
          installedBefore: facts.isInstalled(ref),
          buildArtifact: (input: {
            readonly installedBefore: boolean;
            readonly observation: SubagentProjectionObservation;
          }) =>
            Effect.gen(function* () {
              const sourceHash = yield* facts.readContentIdentity(ref);
              const sameVersion = before.previousVersion === version;
              const sameSource =
                before.sourceHash === undefined ||
                sourceHash === undefined ||
                before.sourceHash === sourceHash;
              const change = !input.installedBefore
                ? "created"
                : sameVersion && sameSource
                  ? "unchanged"
                  : "updated";
              const targets = input.observation.targets.map(
                (target) => ({ ...target, change }) as const,
              );
              return {
                path: targets[0]?.path ?? ref.subagent.name,
                scope: workspace.scope,
                agents: input.observation.agents,
                ...(version === undefined ? {} : { version }),
                change,
                ...(before.previousVersion !== undefined && before.previousVersion !== version
                  ? { previousVersion: before.previousVersion }
                  : {}),
                ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
              } as const;
            }),
        };
      }),
    );
  });
