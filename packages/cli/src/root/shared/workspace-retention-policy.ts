import * as Effect from "effect/Effect";

import type { UninstallRetentionPolicy } from "@agentxm/client-core/unstable/extensions";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy => ({
  isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
});

export const makeWorkspaceRetentionPolicyEffect = (): Effect.Effect<
  UninstallRetentionPolicy,
  never,
  WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return makeWorkspaceRetentionPolicy(ws);
  });
