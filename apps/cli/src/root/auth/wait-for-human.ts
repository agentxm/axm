import { withParameterDescription, withParameterRange } from "../../cli-parameters.js";
import { Flag } from "effect/cli";

export const waitForHumanOption = Flag.Int("wait-for-human").pipe(
  withParameterDescription(
    "Wait up to this many seconds for a person to approve in a browser; implies --device-code",
  ),
  withParameterRange(1, Number.MAX_SAFE_INTEGER),
  Flag.optional,
);
