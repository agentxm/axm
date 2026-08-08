import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";

export const backfillFlag = Flag.boolean("backfill").pipe(
  Flag.withDescription("Publish an unpublished version lower than the highest published version"),
);

export const onExistingPolicies = ["error", "verify"] as const;

export type OnExistingPolicy = (typeof onExistingPolicies)[number];

export const onExistingFlag = Flag.choice("on-existing", onExistingPolicies).pipe(
  Flag.withDescription("Override existing-version policy (verify requires identical integrity)"),
  Flag.optional,
);

export type PublishSelectionMode = "authored" | "all" | "explicit" | "filtered-explicit";

export const resolveExistingVersionPolicy = (
  onExisting: Option.Option<OnExistingPolicy>,
  selection: {
    readonly mode: PublishSelectionMode;
    readonly includedDependency: boolean;
  },
): OnExistingPolicy =>
  Option.getOrElse(onExisting, () =>
    selection.includedDependency || selection.mode === "authored" || selection.mode === "all"
      ? "verify"
      : "error",
  );
