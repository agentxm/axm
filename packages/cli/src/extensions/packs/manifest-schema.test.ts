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

  it("accepts valid manifest with extension version maps", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: { "@wayne/grappling-hook": "^1.0.0" },
      "mcp-servers": { "@wayne/batcomputer": "^3.0.0" },
    };
    const result = decode(input);
    expect(result.name).toBe("@wayne/utility-belt");
    expect(result.skills).toEqual({ "@wayne/grappling-hook": "^1.0.0" });
    expect(result["mcp-servers"]).toEqual({ "@wayne/batcomputer": "^3.0.0" });
  });

  it("accepts valid manifest with all extension types", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: { "@wayne/grappling-hook": "^1.0.0", "@wayne/batarang": "~2.0.0" },
      commands: { "@wayne/batcomputer-sync": "^1.0.0" },
      "mcp-servers": { "@wayne/batcomputer": "^3.0.0" },
    };
    const result = decode(input);
    expect(result.commands).toEqual({ "@wayne/batcomputer-sync": "^1.0.0" });
  });

  it("accepts manifest with common optional fields", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      description: "Standard frontend agent tooling",
      keywords: ["frontend", "tooling"],
      license: "MIT",
      skills: { "@wayne/grappling-hook": "^1.0.0" },
    };
    const result = decode(input);
    expect(result.description).toBe("Standard frontend agent tooling");
    expect(result.keywords).toEqual(["frontend", "tooling"]);
    expect(result.license).toBe("MIT");
  });

  it("rejects manifest with invalid FQN key in skills", () => {
    const input = {
      name: "@wayne/utility-belt",
      version: "1.0.0",
      skills: { "grappling-hook": "^1.0.0" },
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest missing required fields", () => {
    const input = { skills: { "@wayne/grappling-hook": "^1.0.0" } };
    expect(() => decode(input)).toThrow();
  });

  it("accepts empty extension maps", () => {
    const input = {
      name: "@wayne/utility-belt",
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
