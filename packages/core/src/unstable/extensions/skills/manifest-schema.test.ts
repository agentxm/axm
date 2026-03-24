import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SkillManifestSchema } from "./manifest-schema.js";

describe("SkillManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(SkillManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = {
      namespace: "@wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      agents: ["claude-code"],
    };
    const result = decode(input);
    expect(result.namespace).toBe("@wayne");
    expect(result.type).toBe("skill");
    expect(result.name).toBe("grappling-hook");
    expect(result.version).toBe("1.0.0");
    expect(result.agents).toEqual(["claude-code"]);
  });

  it("accepts valid full manifest with all optional fields", () => {
    const input = {
      namespace: "@wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      description: "A grappling hook skill",
      keywords: ["utility", "mobility"],
      repository: "https://github.com/wayne/grappling-hook",
      homepage: "https://wayne.tech/grappling-hook",
      license: "MIT",
      bugs: "https://github.com/wayne/grappling-hook/issues",
      authors: [
        {
          name: "Bruce Wayne",
          email: "bruce@wayne.tech",
          url: "https://wayne.tech",
        },
      ],
      agents: ["claude-code", "cursor"],
    };
    const result = decode(input);
    expect(result.name).toBe("grappling-hook");
    expect(result.description).toBe("A grappling hook skill");
    expect(result.keywords).toEqual(["utility", "mobility"]);
    expect(result.authors?.[0]?.name).toBe("Bruce Wayne");
    expect(result.agents).toEqual(["claude-code", "cursor"]);
  });

  it("rejects manifest missing name", () => {
    const input = { namespace: "@wayne", type: "skill", version: "1.0.0", agents: ["claude-code"] };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = {
      namespace: "wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      agents: ["claude-code"],
    };
    expect(() => decode(input)).toThrow();
  });

  it("accepts manifest without agents field", () => {
    const input = { namespace: "@wayne", type: "skill", name: "grappling-hook", version: "1.0.0" };
    const result = decode(input);
    expect(result.agents).toBeUndefined();
  });

  it("rejects manifest with empty agents array", () => {
    const input = {
      namespace: "@wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      agents: [],
    };
    // Empty array is structurally valid for Schema.Array(Schema.String)
    const result = decode(input);
    expect(result.agents).toEqual([]);
  });

  it("accepts manifest with agents as string identifiers", () => {
    const input = {
      namespace: "@wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      agents: ["claude-code", "cursor", "windsurf"],
    };
    const result = decode(input);
    expect(result.agents).toEqual(["claude-code", "cursor", "windsurf"]);
  });

  it("rejects manifest with non-string agents", () => {
    const input = {
      namespace: "@wayne",
      type: "skill",
      name: "grappling-hook",
      version: "1.0.0",
      agents: [123],
    };
    expect(() => decode(input)).toThrow();
  });
});
