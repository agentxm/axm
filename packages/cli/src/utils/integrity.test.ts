import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { computeIntegrity } from "./integrity.js";

describe("computeIntegrity", () => {
  it("returns sha512-<base64> for known input", () => {
    const data = new TextEncoder().encode("hello");
    const result = Effect.runSync(computeIntegrity(data));
    expect(result).toBe(
      "sha512-m3HSJL1i83hdltRq0+o9czGb+8KJDKra4t/3JRlnPKcjI8PZm6XBHXx6zG4UuMXaDEZjR1wuXDre9G9zvN7AQw==",
    );
  });

  it("returns different integrity values for different inputs", () => {
    const a = Effect.runSync(computeIntegrity(new TextEncoder().encode("a")));
    const b = Effect.runSync(computeIntegrity(new TextEncoder().encode("b")));
    expect(a).not.toBe(b);
  });
});
