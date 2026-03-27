/**
 * Unit tests for parseSkillMd.
 *
 * Tests SKILL.md frontmatter parsing for skill discovery.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { parseSkillMd } from "./parse-skill-md.js";

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("parseSkillMd", () => {
  describe("valid frontmatter", () => {
    it("returns Some(Skill) with name and description", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "---",
        "",
        "# My Skill",
        "",
        "Some documentation here.",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(skill.name).toBe("my-skill");
      expect(skill.description).toBe("A useful skill");
      expect(Option.isNone(skill.metadata)).toBe(true);
    });
  });

  describe("missing required fields", () => {
    it("returns None when name is missing", () => {
      const content = ["---", "description: A useful skill", "---", "", "# My Skill"].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });

    it("returns None when description is missing", () => {
      const content = ["---", "name: my-skill", "---", "", "# My Skill"].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe("empty required fields", () => {
    it("returns None when name is empty string", () => {
      const content = [
        "---",
        'name: ""',
        "description: A useful skill",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });

    it("returns None when description is empty string", () => {
      const content = ["---", "name: my-skill", 'description: ""', "---", "", "# My Skill"].join(
        "\n",
      );

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe("no frontmatter", () => {
    it("returns None when there is no frontmatter block", () => {
      const content = ["# My Skill", "", "Just plain markdown."].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe("invalid YAML", () => {
    it("returns None when frontmatter contains invalid YAML", () => {
      const content = ["---", "name: [invalid", "  yaml: {broken", "---", "", "# My Skill"].join(
        "\n",
      );

      const result = parseSkillMd(content);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe("metadata extraction", () => {
    it("returns Some metadata when frontmatter has metadata field", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "metadata:",
        "  internal: true",
        "  category: testing",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(Option.isSome(skill.metadata)).toBe(true);
      const metadata = Option.getOrThrow(skill.metadata);
      expect(metadata).toEqual({ internal: true, category: "testing" });
    });

    it("returns None metadata when frontmatter has no metadata field", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(Option.isNone(skill.metadata)).toBe(true);
    });

    it("returns None metadata when metadata is an array", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "metadata:",
        "  - item1",
        "  - item2",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(Option.isNone(skill.metadata)).toBe(true);
    });

    it("returns None metadata when metadata is a string", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "metadata: just-a-string",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(Option.isNone(skill.metadata)).toBe(true);
    });

    it("returns None metadata when metadata is a number", () => {
      const content = [
        "---",
        "name: my-skill",
        "description: A useful skill",
        "metadata: 42",
        "---",
        "",
        "# My Skill",
      ].join("\n");

      const result = parseSkillMd(content);

      expect(Option.isSome(result)).toBe(true);
      const skill = Option.getOrThrow(result);
      expect(Option.isNone(skill.metadata)).toBe(true);
    });
  });
});
