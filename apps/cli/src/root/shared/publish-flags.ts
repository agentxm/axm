import { Flag } from "effect/unstable/cli";

export const backfillFlag = Flag.Boolean("backfill").pipe(
  Flag.withDescription("Publish an unpublished version lower than the highest published version"),
  Flag.withDefault(false),
);
