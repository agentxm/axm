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
      dependencies: {},
    };
    const result = decode(input);
    expect(result.name).toBe("utility-belt");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid manifest with dependencies map", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: {
        "@wayne/skills/grappling-hook": "^1.0.0",
        "@wayne/mcps/batcomputer": "^3.0.0",
      },
    };
    const result = decode(input);
    expect(result.name).toBe("utility-belt");
    expect(result.dependencies).toEqual({
      "@wayne/skills/grappling-hook": "^1.0.0",
      "@wayne/mcps/batcomputer": "^3.0.0",
    });
  });

  it("accepts valid manifest with all extension types", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: {
        "@wayne/skills/grappling-hook": "^1.0.0",
        "@wayne/skills/batarang": "~2.0.0",
        "@wayne/commands/batcomputer-sync": "^1.0.0",
        "@wayne/mcps/batcomputer": "^3.0.0",
        "@wayne/subagents/robin": "^1.0.0",
        "@ac/docs/workspace-baseline": "^1.0.0",
      },
    };
    const result = decode(input);
    expect(result.dependencies["@wayne/commands/batcomputer-sync"]).toBe("^1.0.0");
    expect(result.dependencies["@wayne/subagents/robin"]).toBe("^1.0.0");
    expect(result.dependencies["@ac/docs/workspace-baseline"]).toBe("^1.0.0");
  });

  it("accepts manifest with subagent dependencies", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: {
        "@wayne/subagents/robin": "^1.0.0",
        "@wayne/subagents/alfred": "~2.0.0",
      },
    };
    const result = decode(input);
    expect(result.dependencies).toEqual({
      "@wayne/subagents/robin": "^1.0.0",
      "@wayne/subagents/alfred": "~2.0.0",
    });
  });

  it("accepts manifest with subagents and other extension types", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: {
        "@wayne/skills/grappling-hook": "^1.0.0",
        "@wayne/subagents/robin": "^1.0.0",
      },
    };
    const result = decode(input);
    expect(result.dependencies["@wayne/skills/grappling-hook"]).toBe("^1.0.0");
    expect(result.dependencies["@wayne/subagents/robin"]).toBe("^1.0.0");
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
      dependencies: { "@wayne/skills/grappling-hook": "^1.0.0" },
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
      dependencies: { "grappling-hook": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid semver constraint values", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: { "@wayne/skills/grappling-hook": "latest" },
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects pack-typed FQN keys (packs cannot depend on packs)", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: { "@wayne/packs/other": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow(/packs are not allowed/);
  });

  it("rejects 2-segment FQN keys", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: { "@wayne/grappling-hook": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow(/Expected fully qualified name/);
  });

  it("rejects manifest missing required fields", () => {
    const input = { dependencies: { "@wayne/skills/grappling-hook": "^1.0.0" } };
    expect(() => decode(input)).toThrow();
  });

  it("accepts empty dependencies map", () => {
    const input = {
      owner: "@wayne",
      type: "pack",
      name: "utility-belt",
      version: "1.0.0",
      dependencies: {},
    };
    const result = decode(input);
    expect(result.dependencies).toEqual({});
  });
});
