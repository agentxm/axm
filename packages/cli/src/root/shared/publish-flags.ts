import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";

export const skipExistingFlag = Flag.boolean("skip-existing").pipe(
  Flag.withDescription(
    "Skip extension versions that are already published (alias for --on-existing skip)",
  ),
);

export const onExistingPolicies = ["error", "skip", "verify"] as const;

export type OnExistingPolicy = (typeof onExistingPolicies)[number];

export const onExistingFlag = Flag.choice("on-existing", onExistingPolicies).pipe(
  Flag.withDescription(
    "Policy when a version already exists (default: skip for bulk selections, error for a single explicit selector)",
  ),
  Flag.optional,
);

export const resolveExistingVersionPolicy = (args: {
  readonly onExisting: Option.Option<OnExistingPolicy>;
  readonly skipExisting: boolean;
  readonly bulkSelection: boolean;
}): Effect.Effect<OnExistingPolicy, AppError> =>
  Effect.gen(function* () {
    if (args.skipExisting && Option.isSome(args.onExisting) && args.onExisting.value !== "skip") {
      return yield* makeAppError({
        code: "usage",
        detail: `--skip-existing conflicts with --on-existing ${args.onExisting.value}`,
        recover: "Use --on-existing skip, or drop --skip-existing.",
      });
    }
    if (Option.isSome(args.onExisting)) return args.onExisting.value;
    if (args.skipExisting) return "skip";
    return args.bulkSelection ? "skip" : "error";
  });
