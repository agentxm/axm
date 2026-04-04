import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { PackManifestSchema } from "./manifest-schema.js";

describe("PackManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(PackManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
    };
    const result = decode(input);
    expect(result.name).toBe("utility-belt");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid manifest with extension version maps", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: { "@wayne/skills/grappling-hook": "^1.0.0" },
      "mcp-servers": { "@wayne/mcp-servers/batcomputer": "^3.0.0" },
    };
    const result = decode(input);
    expect(result.name).toBe("utility-belt");
    expect(result.skills).toEqual({ "@wayne/skills/grappling-hook": "^1.0.0" });
    expect(result["mcp-servers"]).toEqual({ "@wayne/mcp-servers/batcomputer": "^3.0.0" });
  });

  it("accepts valid manifest with all extension types", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: { "@wayne/skills/grappling-hook": "^1.0.0", "@wayne/skills/batarang": "~2.0.0" },
      commands: { "@wayne/commands/batcomputer-sync": "^1.0.0" },
      "mcp-servers": { "@wayne/mcp-servers/batcomputer": "^3.0.0" },
    };
    const result = decode(input);
    expect(result.commands).toEqual({ "@wayne/commands/batcomputer-sync": "^1.0.0" });
  });

  it("accepts manifest with common optional fields", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      description: "Standard frontend agent tooling",
      keywords: ["frontend", "tooling"],
      license: "MIT",
      skills: { "@wayne/skills/grappling-hook": "^1.0.0" },
    };
    const result = decode(input);
    expect(result.description).toBe("Standard frontend agent tooling");
    expect(result.keywords).toEqual(["frontend", "tooling"]);
    expect(result.license).toBe("MIT");
  });

  it("rejects manifest with invalid FQN key in skills", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: { "grappling-hook": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid semver constraint values", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: { "@wayne/skills/grappling-hook": "latest" },
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects 2-segment FQN keys", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: { "@wayne/grappling-hook": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow(/Expected a string matching the RegExp/);
  });

  it("rejects manifest missing required fields", () => {
    const input = { skills: { "@wayne/skills/grappling-hook": "^1.0.0" } };
    expect(() => decode(input)).toThrow();
  });

  it("accepts empty extension maps", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      skills: {},
      commands: {},
      "mcp-servers": {},
    };
    const result = decode(input);
    expect(result.skills).toEqual({});
    expect(result.commands).toEqual({});
    expect(result["mcp-servers"]).toEqual({});
  });
});
