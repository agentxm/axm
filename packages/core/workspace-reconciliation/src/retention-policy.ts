import * as Effect from "effect/Effect";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";
import type { UninstallRetentionPolicy } from "./extensions/operations.js";

/** Remaining desired Pack routes retain a leaf after withdrawing its direct declaration. */
export const makeWorkspaceRetentionPolicy = <E>(
  ws: WorkspaceMutationsService,
  toFailure: (
    cause: Effect.Error<
      ReturnType<WorkspaceMutationsService["isExtensionRequiredByInstalledPack"]>
    >,
  ) => E,
): UninstallRetentionPolicy<E> => ({
  isRequiredByInstalledPack: ({ target }) =>
    ws.isExtensionRequiredByInstalledPack(target).pipe(Effect.mapError(toFailure)),
});

/** Only a planner that proved an exclusive member closure uses this policy. */
export const exclusiveMemberRetentionPolicy: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};
