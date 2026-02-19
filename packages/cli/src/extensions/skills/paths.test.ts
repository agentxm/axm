import { describe, expect, it } from "vitest";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";

const join = (...parts: string[]) => parts.join("/");
const base = "/workspace";

describe("computeSkillPaths", () => {
  describe("non-registry sources", () => {
    it("git-hosted source produces external extensions path", () => {
      const source: SkillPathSource = { refType: "git-hosted" };
      const result = computeSkillPaths(join, base, source, "code-review");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/external/skills/code-review");
      expect(result.skillSrcPath).toBe("/workspace/.axm/extensions/external/skills/code-review");
    });

    it("local source produces external extensions path", () => {
      const source: SkillPathSource = { refType: "local" };
      const result = computeSkillPaths(join, base, source, "my-skill");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/external/skills/my-skill");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("builtin source produces external extensions path", () => {
      const source: SkillPathSource = { refType: "builtin" };
      const result = computeSkillPaths(join, base, source, "test-gen");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/external/skills/test-gen");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("canonicalPath equals skillSrcPath for all non-registry sources", () => {
      const refTypes = ["git-hosted", "local", "builtin"] as const;
      for (const refType of refTypes) {
        const source: SkillPathSource = { refType };
        const result = computeSkillPaths(join, base, source, "skill");
        expect(result.canonicalPath).toBe(result.skillSrcPath);
      }
    });
  });

  describe("registry source", () => {
    it("produces registry extensions path with scope", () => {
      const source: SkillPathSource = { refType: "registry", scope: "@acme" };
      const result = computeSkillPaths(join, base, source, "code-review");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@acme/skills/code-review");
      expect(result.skillSrcPath).toBe("/workspace/.axm/extensions/@acme/skills/code-review/src");
    });

    it("canonicalPath and skillSrcPath differ by /src suffix", () => {
      const source: SkillPathSource = { refType: "registry", scope: "@corp" };
      const result = computeSkillPaths(join, base, source, "linter");

      expect(result.skillSrcPath).toBe(result.canonicalPath + "/src");
    });

    it("handles different scopes correctly", () => {
      const source: SkillPathSource = { refType: "registry", scope: "@community" };
      const result = computeSkillPaths(join, base, source, "test-gen");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@community/skills/test-gen");
    });
  });
});
