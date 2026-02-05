import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { PackManifestSchema } from "./manifest-schema";

describe("PackManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(PackManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/utility-belt", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/utility-belt");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid manifest with extension references", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: ["@wayne/grappling-hook"],
      "mcp-servers": ["@wayne/batcomputer"],
      packs: ["@wayne/base-toolkit"],
    };
    const result = decode(input);
    expect(result.name).toBe("@wayne/utility-belt");
    expect(result.skills).toEqual(["@wayne/grappling-hook"]);
    expect(result["mcp-servers"]).toEqual(["@wayne/batcomputer"]);
    expect(result.packs).toEqual(["@wayne/base-toolkit"]);
  });

  it("accepts valid manifest with all extension types", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: ["@wayne/grappling-hook", "@wayne/batarang"],
      commands: ["@wayne/batcomputer-sync"],
      "mcp-servers": ["@wayne/batcomputer"],
      packs: ["@wayne/base-toolkit"],
    };
    const result = decode(input);
    expect(result.commands).toEqual(["@wayne/batcomputer-sync"]);
  });

  it("rejects manifest with invalid extension reference", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: ["grappling-hook"],
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest missing required fields", () => {
    const input = { skills: ["@wayne/grappling-hook"] };
    expect(() => decode(input)).toThrow();
  });
});
