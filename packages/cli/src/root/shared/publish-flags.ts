import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";

export const backfillFlag = Flag.boolean("backfill").pipe(
  Flag.withDescription("Publish an unpublished version lower than the highest published version"),
);

export const onExistingPolicies = ["error", "verify"] as const;

export type OnExistingPolicy = (typeof onExistingPolicies)[number];

export const onExistingFlag = Flag.choice("on-existing", onExistingPolicies).pipe(
  Flag.withDescription(
    "Policy when a version already exists (default: error; verify requires identical integrity)",
  ),
  Flag.optional,
);

export const resolveExistingVersionPolicy = (
  onExisting: Option.Option<OnExistingPolicy>,
): OnExistingPolicy => Option.getOrElse(onExisting, () => "error");
