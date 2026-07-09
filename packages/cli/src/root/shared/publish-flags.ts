import { Flag } from "effect/unstable/cli";

export const skipExistingFlag = Flag.boolean("skip-existing").pipe(
  Flag.withDescription("Skip extension versions that are already published"),
);
