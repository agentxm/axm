import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SkillManifestSchema } from "./manifest-schema";

describe("SkillManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(SkillManifestSchema);

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
