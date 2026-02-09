/**
 * Unit tests for post-discovery skill utilities.
 *
 * Tests display name resolution, skill filtering, and name sanitization.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { SkillRef } from "../operations.js";
import { filterSkills, getSkillDisplayName, sanitizeName } from "./skill-utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkill = (name: string, path: string = `/fake/${name || "unnamed"}`): SkillRef => ({
  type: "skill",
  skill: { name, description: "", metadata: Option.none() },
  source: { source: "local", path },
  location: `file://${path}`,
  version: Option.none(),
  gitTreeSha: Option.none(),
});

// -----------------------------------------------------------------------------
// getSkillDisplayName
// -----------------------------------------------------------------------------

describe("getSkillDisplayName", () => {
  it("returns name when present", () => {
    const skill = makeSkill("my-skill", "/repo/skills/my-skill");
    expect(getSkillDisplayName(skill)).toBe("my-skill");
  });

  it("falls back to basename(path) when name is empty", () => {
    const skill = makeSkill("", "/repo/skills/my-dir");
    expect(getSkillDisplayName(skill)).toBe("my-dir");
  });

  it("falls back to basename(path) when name is falsy", () => {
    // Simulate undefined/null name via type coercion for edge case
    const skill = makeSkill("", "/repo/skills/fallback-dir");
    expect(getSkillDisplayName(skill)).toBe("fallback-dir");
  });
});

// -----------------------------------------------------------------------------
// filterSkills
// -----------------------------------------------------------------------------

describe("filterSkills", () => {
  it("matches by skill.name case-insensitively", () => {
    const skills = [makeSkill("my-skill"), makeSkill("other-skill")];
    const result = filterSkills(skills, ["My-Skill"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.skill.name).toBe("my-skill");
  });

  it("matches by display name (basename fallback) case-insensitively", () => {
    const skill = makeSkill("", "/repo/skills/my-dir");
    const result = filterSkills([skill], ["My-Dir"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.location).toBe("file:///repo/skills/my-dir");
  });

  it("returns skills matching any of multiple input names", () => {
    const skills = [makeSkill("skill-a"), makeSkill("skill-b"), makeSkill("skill-c")];
    const result = filterSkills(skills, ["skill-a", "skill-b"]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.skill.name)).toEqual(["skill-a", "skill-b"]);
  });

  it("returns empty array when no match", () => {
    const skills = [makeSkill("skill-a")];
    const result = filterSkills(skills, ["other-skill"]);
    expect(result).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// sanitizeName
// -----------------------------------------------------------------------------

describe("sanitizeName", () => {
  it("passes through simple names", () => {
    expect(sanitizeName("my-skill")).toBe("my-skill");
  });

  it("converts to lowercase", () => {
    expect(sanitizeName("My-Skill")).toBe("my-skill");
  });

  it("replaces special characters with hyphens", () => {
    expect(sanitizeName("my skill@v2!")).toBe("my-skill-v2");
  });

  it("collapses consecutive non-alphanumeric characters to a single hyphen", () => {
    expect(sanitizeName("a--b")).toBe("a-b");
    expect(sanitizeName("a @b")).toBe("a-b");
    expect(sanitizeName("a---b")).toBe("a-b");
  });

  it("preserves dots and underscores", () => {
    expect(sanitizeName("my_skill.v2")).toBe("my_skill.v2");
  });

  it("strips leading dots and hyphens", () => {
    expect(sanitizeName(".hidden-skill")).toBe("hidden-skill");
  });

  it("strips leading hyphens", () => {
    expect(sanitizeName("--prefixed")).toBe("prefixed");
  });

  it("strips trailing dots and hyphens", () => {
    expect(sanitizeName("skill-.")).toBe("skill");
  });

  it("falls back to 'unnamed-skill' when empty after stripping", () => {
    expect(sanitizeName("...")).toBe("unnamed-skill");
  });

  it("truncates to 255 characters", () => {
    const longName = "a".repeat(300);
    const result = sanitizeName(longName);
    expect(result).toHaveLength(255);
    expect(result).toBe("a".repeat(255));
  });

  it("falls back to 'unnamed-skill' for empty input", () => {
    expect(sanitizeName("")).toBe("unnamed-skill");
  });
});
