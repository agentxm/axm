import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { computeIntegrity, sha512Integrity } from "./integrity.js";

describe("SHA-512 integrity", () => {
  it("computes SRI format from bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    const expected = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    expect(sha512Integrity(bytes)).toBe(expected);
  });

  it("distinguishes different payloads", () => {
    const first = sha512Integrity(new TextEncoder().encode("hello"));
    const second = sha512Integrity(new TextEncoder().encode("world"));
    expect(first).not.toBe(second);
  });

  it("returns the same digest for the same payload", () => {
    const bytes = new TextEncoder().encode("test");
    expect(sha512Integrity(bytes)).toBe(sha512Integrity(bytes));
  });

  it.effect("agrees with the synchronous form", () =>
    Effect.gen(function* () {
      const bytes = new TextEncoder().encode("agreement");
      expect(yield* computeIntegrity(bytes)).toBe(sha512Integrity(bytes));
    }),
  );
});
