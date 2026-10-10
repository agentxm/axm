import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { Flag } from "effect/cli";

export const backfillFlag = Flag.Boolean("backfill").pipe(
  withParameterDescription(
    "Publish an unpublished version lower than the highest published version",
  ),
  withParameterDefault(false),
);
