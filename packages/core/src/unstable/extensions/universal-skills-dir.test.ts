import { describe, expect, it } from "vitest";

import {
  UNIVERSAL_SKILLS_DIR,
  UNIVERSAL_SKILLS_DIR_SEGMENT,
  isUniversalSkillsDir,
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
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

describe("isUniversalSkillsRelativeDir", () => {
  it("returns true for the universal skills dir", () => {
    expect(isUniversalSkillsRelativeDir(".agents/skills")).toBe(true);
  });

  it("returns false for an agent-specific dir", () => {
    expect(isUniversalSkillsRelativeDir(".claude/skills")).toBe(false);
  });
});

describe("resolveUniversalDirPresence", () => {
  const entry = (agentId: string, exists: boolean) => ({ agentId, exists });

  it("returns input unchanged when universalAgentIds is empty", () => {
    const perAgent = [entry("amp", true), entry("claude-code", false)];
    const result = resolveUniversalDirPresence(perAgent, new Set());
    expect(result).toEqual(perAgent);
  });

  it("propagates presence to all universal-dir agents when any has the artifact", () => {
    const perAgent = [entry("amp", true), entry("kimi-cli", false), entry("claude-code", false)];
    const universalIds = new Set(["amp", "kimi-cli"]);
    const result = resolveUniversalDirPresence(perAgent, universalIds);
    expect(result).toEqual([
      entry("amp", true),
      entry("kimi-cli", true),
      entry("claude-code", false),
    ]);
  });

  it("does not propagate when no universal-dir agent has the artifact", () => {
    const perAgent = [entry("amp", false), entry("kimi-cli", false), entry("claude-code", true)];
    const universalIds = new Set(["amp", "kimi-cli"]);
    const result = resolveUniversalDirPresence(perAgent, universalIds);
    expect(result).toEqual(perAgent);
  });

  it("leaves non-universal agents unchanged", () => {
    const perAgent = [entry("amp", true), entry("claude-code", false)];
    const universalIds = new Set(["amp"]);
    const result = resolveUniversalDirPresence(perAgent, universalIds);
    expect(result).toEqual([entry("amp", true), entry("claude-code", false)]);
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
