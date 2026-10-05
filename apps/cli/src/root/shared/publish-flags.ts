import { Flag } from "effect/cli";

export const backfillFlag = Flag.Boolean("backfill").pipe(
  Flag.withDescription("Publish an unpublished version lower than the highest published version"),
  Flag.withDefault(false),
);
