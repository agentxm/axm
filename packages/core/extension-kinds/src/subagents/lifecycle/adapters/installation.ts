import * as Effect from "effect/Effect";
import {
  LockfileReader,
  WorkspaceLocation,
  lockEntryVersion,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Option from "effect/Option";
import { type ExtensionLifecycleFailed } from "@agentxm/workspace-kernel/operations";
import type { SubagentInstallationFacts } from "../application/installation.js";
import type { InstallStepRequirements } from "@agentxm/workspace-kernel/reconciliation";

export const subagentInstallationFacts: SubagentInstallationFacts<
  ExtensionLifecycleFailed,
  InstallStepRequirements
> = {
  workspace: Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return { scope: location.scope };
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
