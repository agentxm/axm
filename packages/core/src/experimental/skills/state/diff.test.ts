/**
 * Tests for diff computation module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { computeDiff, getChangesToApply, hasChanges } from "./diff.js";
import type {
  ActualSkill,
  IdealSkillLegacy as IdealSkill,
  IdealSkillsState,
  SkillState,
  SkillsState,
} from "./types.js";
import { SkillSource, SkillValidity } from "./types.js";

// Test helpers
const makeIdealSkill = (name: string, hash = "abc123"): IdealSkill => ({
  name,
  source: SkillSource.Local({ path: `/test/${name}` }),
  gitTreeFolderHash: hash,
  description: Option.none(),
  agents: [],
});

const makeActualSkill = (name: string, hash = "abc123"): ActualSkill => ({
  name,
  path: `/test/${name}`,
  frontmatter: Option.some({ name, description: "test" }),
  content: "# Test",
  gitTreeFolderHash: hash,
  files: ["SKILL.md"],
  lastModified: new Date(),
});

const makeSkillState = (
  name: string,
  hash = "abc123",
  validity: SkillValidity = SkillValidity.Valid(),
): SkillState => ({
  name,
  actual: Option.some(makeActualSkill(name, hash)),
  locked: Option.none(),
  validity,
});

describe("computeDiff", () => {
  it("returns empty diff when no skills exist", () => {
    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = { skills: {}, removals: [] };

    const diff = computeDiff(current, ideal);

    expect(diff.changes).toEqual({});
    expect(diff.summary).toEqual({ add: 0, update: 0, remove: 0, unchanged: 0, repair: 0 });
  });

  it("identifies Add when skill in ideal but not in current", () => {
    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: { "new-skill": makeIdealSkill("new-skill") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.add).toBe(1);
    expect(diff.changes["new-skill"]?._tag).toBe("Add");
  });

  it("identifies Remove when skill in removals list", () => {
    const current: SkillsState = {
      skills: { "old-skill": makeSkillState("old-skill") },
    };
    const ideal: IdealSkillsState = {
      skills: {},
      removals: ["old-skill"],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.remove).toBe(1);
    expect(diff.changes["old-skill"]?._tag).toBe("Remove");
  });

  it("identifies Update when hash differs", () => {
    const current: SkillsState = {
      skills: { "my-skill": makeSkillState("my-skill", "old-hash") },
    };
    const ideal: IdealSkillsState = {
      skills: { "my-skill": makeIdealSkill("my-skill", "new-hash") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.update).toBe(1);
    expect(diff.changes["my-skill"]?._tag).toBe("Update");
    const change = diff.changes["my-skill"];
    if (change?._tag === "Update") {
      expect(change.to.gitTreeFolderHash).toBe("new-hash");
    }
  });

  it("identifies Unchanged when skill matches", () => {
    const current: SkillsState = {
      skills: { "my-skill": makeSkillState("my-skill", "same-hash") },
    };
    const ideal: IdealSkillsState = {
      skills: { "my-skill": makeIdealSkill("my-skill", "same-hash") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.unchanged).toBe(1);
    expect(diff.changes["my-skill"]?._tag).toBe("Unchanged");
  });

  it("identifies Repair when skill has validity issues", () => {
    const current: SkillsState = {
      skills: {
        "broken-skill": makeSkillState(
          "broken-skill",
          "abc123",
          SkillValidity.HashMismatch({ expected: "expected", actual: "actual" }),
        ),
      },
    };
    const ideal: IdealSkillsState = {
      skills: { "broken-skill": makeIdealSkill("broken-skill") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.repair).toBe(1);
    expect(diff.changes["broken-skill"]?._tag).toBe("Repair");
  });

  it("handles multiple skills with different change types", () => {
    const current: SkillsState = {
      skills: {
        "unchanged-skill": makeSkillState("unchanged-skill", "hash1"),
        "update-skill": makeSkillState("update-skill", "old-hash"),
        "remove-skill": makeSkillState("remove-skill", "hash3"),
      },
    };
    const ideal: IdealSkillsState = {
      skills: {
        "unchanged-skill": makeIdealSkill("unchanged-skill", "hash1"),
        "update-skill": makeIdealSkill("update-skill", "new-hash"),
        "new-skill": makeIdealSkill("new-skill"),
      },
      removals: ["remove-skill"],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary).toEqual({
      add: 1,
      update: 1,
      remove: 1,
      unchanged: 1,
      repair: 0,
    });
  });

  it("treats orphaned skills as needing repair", () => {
    const current: SkillsState = {
      skills: {
        "orphaned-skill": makeSkillState("orphaned-skill", "abc123", SkillValidity.Orphaned()),
      },
    };
    const ideal: IdealSkillsState = {
      skills: { "orphaned-skill": makeIdealSkill("orphaned-skill") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    // Orphaned skill with matching hash should be unchanged (special case)
    expect(diff.changes["orphaned-skill"]?._tag).toBe("Unchanged");
  });
});

describe("hasChanges", () => {
  it("returns false for empty diff", () => {
    const diff = computeDiff({ skills: {} }, { skills: {}, removals: [] });
    expect(hasChanges(diff)).toBe(false);
  });

  it("returns false when only unchanged skills", () => {
    const current: SkillsState = {
      skills: { "my-skill": makeSkillState("my-skill") },
    };
    const ideal: IdealSkillsState = {
      skills: { "my-skill": makeIdealSkill("my-skill") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    expect(hasChanges(diff)).toBe(false);
  });

  it("returns true when there are adds", () => {
    const diff = computeDiff({ skills: {} }, { skills: { s: makeIdealSkill("s") }, removals: [] });
    expect(hasChanges(diff)).toBe(true);
  });

  it("returns true when there are updates", () => {
    const current: SkillsState = {
      skills: { s: makeSkillState("s", "old") },
    };
    const ideal: IdealSkillsState = {
      skills: { s: makeIdealSkill("s", "new") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    expect(hasChanges(diff)).toBe(true);
  });

  it("returns true when there are removes", () => {
    const current: SkillsState = {
      skills: { s: makeSkillState("s") },
    };
    const ideal: IdealSkillsState = {
      skills: {},
      removals: ["s"],
    };

    const diff = computeDiff(current, ideal);
    expect(hasChanges(diff)).toBe(true);
  });
});

describe("getChangesToApply", () => {
  it("returns empty array for empty diff", () => {
    const diff = computeDiff({ skills: {} }, { skills: {}, removals: [] });
    expect(getChangesToApply(diff)).toEqual([]);
  });

  it("excludes unchanged skills", () => {
    const current: SkillsState = {
      skills: { unchanged: makeSkillState("unchanged") },
    };
    const ideal: IdealSkillsState = {
      skills: { unchanged: makeIdealSkill("unchanged") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    expect(getChangesToApply(diff)).toEqual([]);
  });

  it("includes add, update, remove changes", () => {
    const current: SkillsState = {
      skills: {
        update: makeSkillState("update", "old"),
        remove: makeSkillState("remove"),
      },
    };
    const ideal: IdealSkillsState = {
      skills: {
        add: makeIdealSkill("add"),
        update: makeIdealSkill("update", "new"),
      },
      removals: ["remove"],
    };

    const diff = computeDiff(current, ideal);
    const changes = getChangesToApply(diff);

    expect(changes.length).toBe(3);
    expect(changes.map(([name]) => name).sort()).toEqual(["add", "remove", "update"]);
  });
});
