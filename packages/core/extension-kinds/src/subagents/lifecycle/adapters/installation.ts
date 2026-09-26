import * as Effect from "effect/Effect";
import {
  LockfileReader,
  WorkspaceLocation,
  lockEntryVersion,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Option from "effect/Option";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import {
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import type { SubagentInstallationFacts } from "../application/installation.js";
import type { InstallStepRequirements } from "@agentxm/workspace-kernel/reconciliation";

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
      return Option.match(entry, { onNone: () => undefined, onSome: lockEntryVersion });
    }),
};
