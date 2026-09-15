import * as Effect from "effect/Effect";
import { LockfileReader, WorkspaceLocation } from "@agentxm/workspace/desired-state";

import * as Option from "effect/Option";
import { SubagentManager } from "@agentxm/workspace/materialization";
import { CodingAgentRepository } from "@agentxm/workspace/projection";
import type { ExtensionLifecycleFailed } from "../../errors.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import type { SubagentInstallationFacts } from "../application/installation.js";

const previousResolvedVersion = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("type" in entry) || entry.type !== "registry") return undefined;
  if (!("resolvedVersion" in entry) || typeof entry.resolvedVersion !== "string") return undefined;
  return entry.resolvedVersion;
};

const previousContentIdentity = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  if (!("contentIdentity" in entry) || typeof entry.contentIdentity !== "string") return undefined;
  return entry.contentIdentity;
};

export const makeSubagentInstallationFacts: Effect.Effect<
  SubagentInstallationFacts<
    ExtensionLifecycleFailed,
    InstallStepRequirements,
    InstallStepRequirements
  >,
  never,
  SubagentManager
> = Effect.gen(function* () {
  const manager = yield* SubagentManager;
  return {
    workspace: Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      if (location.scope !== "user") return { scope: location.scope, placements: [] };
      const agents = yield* (yield* CodingAgentRepository).getConfiguredAgents().pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: "Configured agents could not be read",
            cause,
          }),
        ),
      );
      const placements = yield* Effect.forEach(
        agents,
        (agent) =>
          agent
            .resolveEffectiveSubagentsDir({
              workspaceRoot: location.baseDir,
              scope: location.scope,
            })
            .pipe(
              Effect.map((outcome) =>
                outcome._tag === "supported"
                  ? { agentId: agent.id, state: "supported" as const }
                  : { agentId: agent.id, state: outcome._tag, reason: outcome.reason },
              ),
            ),
        { concurrency: "unbounded" },
      ).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: "Configured subagent placement could not be resolved",
            cause,
          }),
        ),
      );
      return { scope: location.scope, placements };
    }),
    inspect: (ref) =>
      Effect.gen(function* () {
        const lockfile = yield* LockfileReader;
        const entry = yield* lockfile
          .entry("subagent", ref.subagent.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        return {
          previousVersion: previousResolvedVersion(Option.getOrUndefined(entry)),
          sourceHash: previousContentIdentity(Option.getOrUndefined(entry)),
        };
      }),
    isInstalled: (ref) =>
      manager
        .isInstalled({ target: { type: "subagent", name: ref.subagent.name } })
        .pipe(Effect.catch(() => Effect.succeed(false))),
    readContentIdentity: (ref) =>
      Effect.gen(function* () {
        const lockfile = yield* LockfileReader;
        const entry = yield* lockfile
          .entry("subagent", ref.subagent.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        return previousContentIdentity(Option.getOrUndefined(entry));
      }),
  } satisfies SubagentInstallationFacts<
    ExtensionLifecycleFailed,
    InstallStepRequirements,
    InstallStepRequirements
  >;
});
