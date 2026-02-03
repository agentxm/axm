import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CommandManifest } from "./manifest-command";
import { McpServerManifest } from "./manifest-mcp-server";
import { PackManifest } from "./manifest-pack";
import { SkillManifest } from "./manifest-skill";

describe("SkillManifest", () => {
  const decode = Schema.decodeUnknownSync(SkillManifest);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/grappling-hook", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/grappling-hook");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid full manifest with all optional fields", () => {
    const input = {
      name: "@wayne/grappling-hook",
      version: "1.0.0",
      description: "A grappling hook skill",
      keywords: ["utility", "mobility"],
      repository: "https://github.com/wayne/grappling-hook",
      homepage: "https://wayne.tech/grappling-hook",
      license: "MIT",
      bugs: "https://github.com/wayne/grappling-hook/issues",
      author: {
        name: "Bruce Wayne",
        email: "bruce@wayne.tech",
        url: "https://wayne.tech",
      },
    };
    const result = decode(input);
    expect(result.name).toBe("@wayne/grappling-hook");
    expect(result.description).toBe("A grappling hook skill");
    expect(result.keywords).toEqual(["utility", "mobility"]);
    expect(result.author?.name).toBe("Bruce Wayne");
  });

  it("rejects manifest missing name", () => {
    const input = { version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = { name: "grappling-hook", version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });
});

describe("CommandManifest", () => {
  const decode = Schema.decodeUnknownSync(CommandManifest);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/batcomputer-sync", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/batcomputer-sync");
    expect(result.version).toBe("1.0.0");
  });

  it("rejects manifest missing version", () => {
    const input = { name: "@wayne/batcomputer-sync" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = { name: "batcomputer-sync", version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });
});

describe("PackManifest", () => {
  const decode = Schema.decodeUnknownSync(PackManifest);

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

describe("McpServerManifest", () => {
  const decode = Schema.decodeUnknownSync(McpServerManifest);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/batcave-mcp", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/batcave-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid full manifest with all optional fields", () => {
    const input = {
      name: "@wayne/batcave-mcp",
      version: "1.0.0",
      description: "MCP server for Batcave systems",
      keywords: ["mcp", "batcave"],
      repository: "https://github.com/wayne/batcave-mcp",
      homepage: "https://wayne.tech/batcave",
      license: "MIT",
      bugs: "https://github.com/wayne/batcave-mcp/issues",
      author: { name: "Alfred Pennyworth" },
    };
    const result = decode(input);
    expect(result.description).toBe("MCP server for Batcave systems");
    expect(result.author?.name).toBe("Alfred Pennyworth");
  });

  it("rejects manifest missing required fields", () => {
    const input = { description: "MCP server" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = { name: "batcave-mcp", version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });
});
