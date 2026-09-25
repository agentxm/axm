import { Flag } from "effect/unstable/cli";

export const waitForHumanOption = Flag.Int("wait-for-human").pipe(
  Flag.withDescription("Wait at most this many seconds for a person to approve in a browser"),
  Flag.optional,
);
