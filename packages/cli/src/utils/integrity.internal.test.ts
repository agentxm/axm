import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { computeIntegrity } from "./integrity.js";

describe("computeIntegrity", () => {
  it.effect("returns sha512-<base64> for known input", () =>
    Effect.gen(function* () {
      const data = new TextEncoder().encode("hello");
      const result = yield* computeIntegrity(data);
      expect(result).toBe(
        "sha512-m3HSJL1i83hdltRq0+o9czGb+8KJDKra4t/3JRlnPKcjI8PZm6XBHXx6zG4UuMXaDEZjR1wuXDre9G9zvN7AQw==",
      );
    }),
  );

  it.effect("returns different integrity values for different inputs", () =>
    Effect.gen(function* () {
      const a = yield* computeIntegrity(new TextEncoder().encode("a"));
      const b = yield* computeIntegrity(new TextEncoder().encode("b"));
      expect(a).not.toBe(b);
    }),
  );
});
