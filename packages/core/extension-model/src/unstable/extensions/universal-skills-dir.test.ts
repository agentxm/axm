import { describe, expect, it } from "vitest";

import {
  UNIVERSAL_SKILLS_DIR,
  UNIVERSAL_SKILLS_DIR_SEGMENT,
  isUniversalSkillsDir,
} from "./universal-skills-dir.js";

describe("UNIVERSAL_SKILLS_DIR", () => {
  it("equals .agents/skills", () => {
    expect(UNIVERSAL_SKILLS_DIR).toBe(".agents/skills");
  });
});

describe("UNIVERSAL_SKILLS_DIR_SEGMENT", () => {
  it("equals .agents", () => {
    expect(UNIVERSAL_SKILLS_DIR_SEGMENT).toBe(".agents");
  });
});

describe("isUniversalSkillsDir", () => {
  const root = "/home/user/project";

  it("returns true for the universal skills directory", () => {
    expect(isUniversalSkillsDir(`${root}/.agents/skills`, root)).toBe(true);
  });

  it("returns false for an agent-specific skills directory", () => {
    expect(isUniversalSkillsDir(`${root}/.agents/my-agent/skills`, root)).toBe(false);
  });

  it("handles trailing slashes via normalization", () => {
    expect(isUniversalSkillsDir(`${root}/.agents/skills/`, root)).toBe(true);
  });

  it("handles trailing slash on workspace root", () => {
    expect(isUniversalSkillsDir(`${root}/.agents/skills`, `${root}/`)).toBe(true);
  });

  it("returns false for a completely unrelated path", () => {
    expect(isUniversalSkillsDir("/other/path", root)).toBe(false);
  });
});
