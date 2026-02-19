import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CommandManifestSchema } from "./manifest-schema";

describe("CommandManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(CommandManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/commands/batcomputer-sync", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/commands/batcomputer-sync");
    expect(result.version).toBe("1.0.0");
  });

  it("rejects manifest missing version", () => {
    const input = { name: "@wayne/commands/batcomputer-sync" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = { name: "batcomputer-sync", version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });
});
