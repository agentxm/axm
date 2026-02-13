import { describe, expect, it } from "vitest";
import { computeSkillPaths, type SkillPathSource } from "./skill-paths.js";

const join = (...parts: string[]) => parts.join("/");
const base = "/workspace";

describe("computeSkillPaths", () => {
  describe("non-registry sources", () => {
    it("github source produces universal skills path", () => {
      const source: SkillPathSource = { type: "github" };
      const result = computeSkillPaths(join, base, source, "code-review");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/code-review");
      expect(result.skillSrcPath).toBe("/workspace/.agents/skills/code-review");
    });

    it("local source produces universal skills path", () => {
      const source: SkillPathSource = { type: "local" };
      const result = computeSkillPaths(join, base, source, "my-skill");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/my-skill");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("git source produces universal skills path", () => {
      const source: SkillPathSource = { type: "git" };
      const result = computeSkillPaths(join, base, source, "test-gen");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/test-gen");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("gitlab source produces universal skills path", () => {
      const source: SkillPathSource = { type: "gitlab" };
      const result = computeSkillPaths(join, base, source, "linter");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/linter");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("bitbucket source produces universal skills path", () => {
      const source: SkillPathSource = { type: "bitbucket" };
      const result = computeSkillPaths(join, base, source, "formatter");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/formatter");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("azurerepos source produces universal skills path", () => {
      const source: SkillPathSource = { type: "azurerepos" };
      const result = computeSkillPaths(join, base, source, "deploy");

      expect(result.canonicalPath).toBe("/workspace/.agents/skills/deploy");
      expect(result.skillSrcPath).toBe(result.canonicalPath);
    });

    it("canonicalPath equals skillSrcPath for all non-registry sources", () => {
      const types = ["github", "local", "git", "gitlab", "bitbucket", "azurerepos"] as const;
      for (const type of types) {
        const source: SkillPathSource = { type };
        const result = computeSkillPaths(join, base, source, "skill");
        expect(result.canonicalPath).toBe(result.skillSrcPath);
      }
    });
  });

  describe("registry source", () => {
    it("produces registry extensions path with scope", () => {
      const source: SkillPathSource = { type: "registry", scope: "@acme" };
      const result = computeSkillPaths(join, base, source, "code-review");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@acme/skills/code-review");
      expect(result.skillSrcPath).toBe("/workspace/.axm/extensions/@acme/skills/code-review/src");
    });

    it("canonicalPath and skillSrcPath differ by /src suffix", () => {
      const source: SkillPathSource = { type: "registry", scope: "@corp" };
      const result = computeSkillPaths(join, base, source, "linter");

      expect(result.skillSrcPath).toBe(result.canonicalPath + "/src");
    });

    it("handles different scopes correctly", () => {
      const source: SkillPathSource = { type: "registry", scope: "@community" };
      const result = computeSkillPaths(join, base, source, "test-gen");

      expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@community/skills/test-gen");
    });
  });
});
