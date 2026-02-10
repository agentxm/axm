import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { computeChecksum } from "./checksum.js";

describe("computeChecksum", () => {
  it("returns sha256:<hex> for known input", () => {
    const data = new TextEncoder().encode("hello");
    const result = Effect.runSync(computeChecksum(data));
    expect(result).toBe("sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns different checksums for different inputs", () => {
    const a = Effect.runSync(computeChecksum(new TextEncoder().encode("a")));
    const b = Effect.runSync(computeChecksum(new TextEncoder().encode("b")));
    expect(a).not.toBe(b);
  });
});
