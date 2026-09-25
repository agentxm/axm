import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { DeprecationReasons, DeprecationViewSchema } from "./deprecation.js";

const deprecatedAt = "2026-08-15T20:00:00.000Z";
const replacement = {
  status: "available",
  fqn: "@acme/skills/review-next",
};
const decode = Schema.decodeUnknownSync(DeprecationViewSchema);

describe("deprecation reason guidance", () => {
  it.each(
    DeprecationReasons.flatMap((reason) =>
      [false, true].flatMap((withReplacement) =>
        [false, true].map((withMessage) => ({ reason, withReplacement, withMessage })),
      ),
    ),
  )(
    "$reason with replacement=$withReplacement and notes=$withMessage",
    ({ reason, withReplacement, withMessage }) => {
      const candidate = {
        deprecatedAt,
        reason,
        ...(withReplacement ? { replacement } : {}),
        ...(withMessage ? { message: "Publisher notes." } : {}),
      };
      const valid =
        reason === "superseded"
          ? withReplacement
          : reason === "obsolete"
            ? !withReplacement && withMessage
            : reason === "unmaintained"
              ? true
              : withMessage;
      if (valid) expect(() => decode(candidate)).not.toThrow();
      else expect(() => decode(candidate)).toThrow();
    },
  );

  it("requires a reason and accepts a concealed successor", () => {
    expect(() => decode({ deprecatedAt, message: "Notes." })).toThrow();
    expect(() =>
      decode({
        deprecatedAt,
        reason: "superseded",
        replacement: { status: "unavailable" },
      }),
    ).not.toThrow();
  });
});
