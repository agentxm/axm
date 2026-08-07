import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as FastCheck from "effect/testing/FastCheck";
import { sanitizeName } from "./utils.js";

const PROPERTY_OPTIONS = { fastCheck: { numRuns: 250, seed: 0x41584d } };

describe("sanitizeName", () => {
  it.prop(
    "is idempotent",
    [Schema.toArbitrary(Schema.String)],
    ([name]) => {
      const sanitized = sanitizeName(name);
      expect(sanitizeName(sanitized)).toBe(sanitized);
      expect(sanitized.length).toBeLessThanOrEqual(255);
    },
    PROPERTY_OPTIONS,
  );

  it.prop(
    "disambiguates distinct display names with the same readable slug",
    {
      left: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
      right: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
      separators: FastCheck.uniqueArray(FastCheck.constantFrom(" ", "@", "/", ":"), {
        minLength: 2,
        maxLength: 2,
      }),
    },
    ({ left, right, separators }) => {
      const first = `${left}${separators[0]}${right}`;
      const second = `${left}${separators[1]}${right}`;
      expect(first).not.toBe(second);
      expect(sanitizeName(first)).not.toBe(sanitizeName(second));
    },
    PROPERTY_OPTIONS,
  );

  it("preserves canonical extension names", () => {
    expect(sanitizeName("code-review")).toBe("code-review");
  });
});
