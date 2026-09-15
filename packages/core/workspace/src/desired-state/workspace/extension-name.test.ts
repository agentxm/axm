import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import { sanitizeName } from "./extension-name.js";

const PROPERTY_OPTIONS = { numRuns: 250, seed: 0x41584d };

describe("sanitizeName", () => {
  fastCheckIt.prop({ name: FastCheck.string() }, PROPERTY_OPTIONS)("is idempotent", ({ name }) => {
    const sanitized = sanitizeName(name);
    expect(sanitizeName(sanitized)).toBe(sanitized);
    expect(sanitized.length).toBeLessThanOrEqual(255);
  });

  fastCheckIt.prop(
    {
      left: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
      right: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
      separators: FastCheck.uniqueArray(FastCheck.constantFrom(" ", "@", "/", ":"), {
        minLength: 2,
        maxLength: 2,
      }),
    },
    PROPERTY_OPTIONS,
  )(
    "disambiguates distinct display names with the same readable slug",
    ({ left, right, separators }) => {
      const first = `${left}${separators[0]}${right}`;
      const second = `${left}${separators[1]}${right}`;
      expect(first).not.toBe(second);
      expect(sanitizeName(first)).not.toBe(sanitizeName(second));
    },
  );

  it("preserves canonical extension names", () => {
    expect(sanitizeName("code-review")).toBe("code-review");
  });
});
