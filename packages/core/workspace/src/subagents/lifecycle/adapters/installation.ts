import * as Effect from "effect/Effect";
import {
  LockfileReader,
  WorkspaceLocation,
  type SubagentLockEntry,
} from "../../../desired-state/index.js";

import * as Option from "effect/Option";
import { CodingAgentRepository } from "../../../projection/index.js";
import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import {
  installRefused,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";
import type { SubagentInstallationFacts } from "../application/installation.js";

/** The version an accepted Registry resolution names; other sources carry none. */
const acceptedVersion = (entry: SubagentLockEntry): string | undefined =>
  entry.source.type === "registry" && "version" in entry.resolved
    ? entry.resolved.version
    : undefined;

export const subagentInstallationFacts: SubagentInstallationFacts<
  ExtensionLifecycleFailed,
  InstallStepRequirements
> = {
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
      // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
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
  previousVersion: (ref) =>
    Effect.gen(function* () {
      const lockfile = yield* LockfileReader;
      const entry = yield* lockfile
        .entry("subagent", ref.subagent.name)
        .pipe(Effect.catch(() => Effect.succeed(Option.none())));
      return Option.match(entry, { onNone: () => undefined, onSome: acceptedVersion });
    }),
};
