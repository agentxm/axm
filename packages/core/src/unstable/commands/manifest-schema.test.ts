import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CommandManifestSchema } from "./manifest-schema.js";

describe("CommandManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(CommandManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = {
      profile: "@wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
    };
    const result = decode(input);
    expect(result.name).toBe("batcomputer-sync");
    expect(result.version).toBe("1.0.0");
  });

  it("rejects manifest missing version", () => {
    const input = { profile: "@wayne", type: "command", name: "batcomputer-sync" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = {
      profile: "wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
    };
    expect(() => decode(input)).toThrow();
  });
});
