import * as Effect from "effect/Effect";
import type { DesiredStateReaderService } from "../desired-state/index.js";
import type { UninstallRetentionPolicy } from "./extensions/operations.js";

/** Remaining desired Pack routes retain a leaf after withdrawing its direct declaration. */
export const makeWorkspaceRetentionPolicy = <E>(
  desiredState: DesiredStateReaderService,
  toFailure: (
    cause: Effect.Error<ReturnType<DesiredStateReaderService["isRequiredByInstalledPack"]>>,
  ) => E,
): UninstallRetentionPolicy<E> => ({
  isRequiredByInstalledPack: ({ target }) =>
    desiredState.isRequiredByInstalledPack(target).pipe(Effect.mapError(toFailure)),
});

/** Only a planner that proved an exclusive member closure uses this policy. */
export const exclusiveMemberRetentionPolicy: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};
