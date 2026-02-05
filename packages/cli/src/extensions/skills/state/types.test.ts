/**
 * Tests for state types module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { AnyIssue, DiffSummary, IdealSkillLegacy, LockedSkill, SkillsDiff } from "./types.js";
import {
  ActualSkillIssue,
  ActualSkillIssueSchema,
  AnyIssueSchema,
  getValidityCode,
  SeveritySchema,
  SkillChange,
  SkillSource,
  SkillStateIssue,
  SkillStateIssueSchema,
  SkillValidity,
  severityFromCode,
  skillsDiffToJson,
  WorkspaceIssue,
  WorkspaceIssueSchema,
} from "./types.js";

describe("SkillValidity constructors", () => {
  it("creates Valid variant", () => {
    const valid = SkillValidity.Valid();
    expect(valid._tag).toBe("Valid");
  });

  it("creates MissingSkillMd with code E001", () => {
    const validity = SkillValidity.MissingSkillMd({ path: "/test/SKILL.md" });
    expect(validity._tag).toBe("MissingSkillMd");
    if (validity._tag === "MissingSkillMd") {
      expect(validity.code).toBe("E001");
      expect(validity.path).toBe("/test/SKILL.md");
    }
  });

  it("creates InvalidFrontmatter with code E002", () => {
    const validity = SkillValidity.InvalidFrontmatter({ errors: ["Parse error"] });
    expect(validity._tag).toBe("InvalidFrontmatter");
    if (validity._tag === "InvalidFrontmatter") {
      expect(validity.code).toBe("E002");
    }
  });

  it("creates NameMismatch with code E003", () => {
    const validity = SkillValidity.NameMismatch({
      frontmatterName: "foo",
      directoryName: "bar",
    });
    expect(validity._tag).toBe("NameMismatch");
    if (validity._tag === "NameMismatch") {
      expect(validity.code).toBe("E003");
    }
  });

  it("creates Missing with code E004", () => {
    const locked: LockedSkill = {
      source: "github:owner/repo",
      origin: "https://github.com/owner/repo",
      path: Option.none(),
      ref: Option.none(),
      version: Option.none(),
      gitTreeFolderHash: "abc123",
      agents: ["claude-code"],
      installedAt: new Date(),
      updatedAt: new Date(),
    };
    const validity = SkillValidity.Missing({ expected: locked });
    expect(validity._tag).toBe("Missing");
    if (validity._tag === "Missing") {
      expect(validity.code).toBe("E004");
    }
  });

  it("creates HashMismatch with code E005", () => {
    const validity = SkillValidity.HashMismatch({
      expected: "abc123",
      actual: "def456",
    });
    expect(validity._tag).toBe("HashMismatch");
    if (validity._tag === "HashMismatch") {
      expect(validity.code).toBe("E005");
    }
  });

  it("creates Incomplete with code E006", () => {
    const validity = SkillValidity.Incomplete({ reason: "Missing files" });
    expect(validity._tag).toBe("Incomplete");
    if (validity._tag === "Incomplete") {
      expect(validity.code).toBe("E006");
    }
  });

  it("creates MissingDescription with code W001", () => {
    const validity = SkillValidity.MissingDescription();
    expect(validity._tag).toBe("MissingDescription");
    if (validity._tag === "MissingDescription") {
      expect(validity.code).toBe("W001");
    }
  });

  it("creates Orphaned with code W002", () => {
    const validity = SkillValidity.Orphaned();
    expect(validity._tag).toBe("Orphaned");
    if (validity._tag === "Orphaned") {
      expect(validity.code).toBe("W002");
    }
  });

  it("creates Multiple with nested issues", () => {
    const validity = SkillValidity.Multiple({
      issues: [SkillValidity.MissingDescription(), SkillValidity.Orphaned()],
    });
    expect(validity._tag).toBe("Multiple");
    if (validity._tag === "Multiple") {
      expect(validity.issues.length).toBe(2);
    }
  });
});

describe("severityFromCode", () => {
  it("returns error for E-prefixed codes", () => {
    expect(severityFromCode("E001")).toBe("error");
    expect(severityFromCode("E002")).toBe("error");
    expect(severityFromCode("E003")).toBe("error");
    expect(severityFromCode("E004")).toBe("error");
    expect(severityFromCode("E005")).toBe("error");
    expect(severityFromCode("E006")).toBe("error");
  });

  it("returns warning for W-prefixed codes", () => {
    expect(severityFromCode("W001")).toBe("warning");
    expect(severityFromCode("W002")).toBe("warning");
  });
});

describe("getValidityCode", () => {
  it("returns null for Valid", () => {
    expect(getValidityCode(SkillValidity.Valid())).toBe(null);
  });

  it("returns code for error variants", () => {
    expect(getValidityCode(SkillValidity.MissingSkillMd({ path: "/test" }))).toBe("E001");
    expect(getValidityCode(SkillValidity.InvalidFrontmatter({ errors: [] }))).toBe("E002");
    expect(
      getValidityCode(SkillValidity.NameMismatch({ frontmatterName: "a", directoryName: "b" })),
    ).toBe("E003");
  });

  it("returns first code for Multiple", () => {
    const validity = SkillValidity.Multiple({
      issues: [SkillValidity.MissingDescription(), SkillValidity.Orphaned()],
    });
    expect(getValidityCode(validity)).toBe("W001");
  });

  it("returns null for empty Multiple", () => {
    const validity = SkillValidity.Multiple({ issues: [] });
    expect(getValidityCode(validity)).toBe(null);
  });
});

describe("SkillSource constructors", () => {
  it("creates Local source", () => {
    const source = SkillSource.Local({ path: "/path/to/skill" });
    expect(source._tag).toBe("Local");
    if (source._tag === "Local") {
      expect(source.path).toBe("/path/to/skill");
    }
  });

  it("creates Git source", () => {
    const source = SkillSource.Git({
      url: "https://github.com/owner/repo",
      ref: Option.some("main"),
      subpath: Option.some("skills/my-skill"),
    });
    expect(source._tag).toBe("Git");
    if (source._tag === "Git") {
      expect(source.url).toBe("https://github.com/owner/repo");
      expect(Option.getOrNull(source.ref)).toBe("main");
      expect(Option.getOrNull(source.subpath)).toBe("skills/my-skill");
    }
  });

  it("creates WellKnown source", () => {
    const source = SkillSource.WellKnown({
      baseUrl: "https://example.com",
      skillName: "my-skill",
    });
    expect(source._tag).toBe("WellKnown");
  });

  it("creates Registry source", () => {
    const source = SkillSource.Registry({
      name: "@community/my-skill",
      version: "1.0.0",
    });
    expect(source._tag).toBe("Registry");
  });
});

describe("SkillChange constructors", () => {
  const makeIdealSkillLegacy = (name: string): IdealSkillLegacy => ({
    name,
    source: SkillSource.Local({ path: "/test" }),
    gitTreeFolderHash: "abc123",
    description: Option.none(),
    agents: ["claude-code"],
  });

  const makeSkillState = (name: string) => ({
    name,
    actual: Option.none(),
    locked: Option.none(),
    validity: SkillValidity.Valid(),
  });

  it("creates Add change", () => {
    const change = SkillChange.Add({ skill: makeIdealSkillLegacy("test") });
    expect(change._tag).toBe("Add");
  });

  it("creates Update change", () => {
    const change = SkillChange.Update({
      from: makeSkillState("test"),
      to: makeIdealSkillLegacy("test"),
    });
    expect(change._tag).toBe("Update");
  });

  it("creates Remove change", () => {
    const change = SkillChange.Remove({ skill: makeSkillState("test") });
    expect(change._tag).toBe("Remove");
  });

  it("creates Unchanged change", () => {
    const change = SkillChange.Unchanged({ skill: makeSkillState("test") });
    expect(change._tag).toBe("Unchanged");
  });

  it("creates Repair change", () => {
    const change = SkillChange.Repair({
      skill: makeSkillState("test"),
      target: makeIdealSkillLegacy("test"),
    });
    expect(change._tag).toBe("Repair");
  });
});

describe("skillsDiffToJson", () => {
  it("converts empty diff to JSON", () => {
    const diff: SkillsDiff = {
      changes: {},
      summary: { add: 0, update: 0, remove: 0, unchanged: 0, repair: 0 },
    };
    const json = skillsDiffToJson(diff);
    expect(json.changes).toEqual([]);
    expect(json.summary).toEqual(diff.summary);
  });

  it("converts diff with Add change to JSON array", () => {
    const idealSkill: IdealSkillLegacy = {
      name: "my-skill",
      source: SkillSource.Local({ path: "/test" }),
      gitTreeFolderHash: "abc123",
      description: Option.none(),
      agents: [],
    };
    const diff: SkillsDiff = {
      changes: {
        "my-skill": SkillChange.Add({ skill: idealSkill }),
      },
      summary: { add: 1, update: 0, remove: 0, unchanged: 0, repair: 0 },
    };
    const json = skillsDiffToJson(diff);
    expect(json.changes.length).toBe(1);
    const firstChange = json.changes[0];
    expect(firstChange).toBeDefined();
    expect(firstChange?.name).toBe("my-skill");
    expect(firstChange?._tag).toBe("Add");
  });

  it("preserves summary in JSON output", () => {
    const summary: DiffSummary = { add: 2, update: 1, remove: 3, unchanged: 5, repair: 1 };
    const diff: SkillsDiff = {
      changes: {},
      summary,
    };
    const json = skillsDiffToJson(diff);
    expect(json.summary).toEqual(summary);
  });
});

// =============================================================================
// Issue Types (new reconciliation design)
// =============================================================================

describe("Severity type", () => {
  it("validates error severity", () => {
    const result = Schema.decodeUnknownSync(SeveritySchema)("error");
    expect(result).toBe("error");
  });

  it("validates warning severity", () => {
    const result = Schema.decodeUnknownSync(SeveritySchema)("warning");
    expect(result).toBe("warning");
  });

  it("rejects invalid severity", () => {
    expect(() => Schema.decodeUnknownSync(SeveritySchema)("info")).toThrow();
  });
});

describe("ActualSkillIssue constructors", () => {
  it("creates MissingSkillMd issue", () => {
    const issue = ActualSkillIssue.MissingSkillMd({ path: "/skills/test" });
    expect(issue._tag).toBe("MissingSkillMd");
    if (issue._tag === "MissingSkillMd") {
      expect(issue.path).toBe("/skills/test");
    }
    expect(issue.severity).toBe("error");
  });

  it("creates InvalidFrontmatter issue", () => {
    const errors = ["Invalid YAML", "Missing name field"];
    const issue = ActualSkillIssue.InvalidFrontmatter({ errors });
    expect(issue._tag).toBe("InvalidFrontmatter");
    if (issue._tag === "InvalidFrontmatter") {
      expect(issue.errors).toEqual(errors);
    }
    expect(issue.severity).toBe("error");
  });

  it("creates MissingDescription issue", () => {
    const issue = ActualSkillIssue.MissingDescription();
    expect(issue._tag).toBe("MissingDescription");
    expect(issue.severity).toBe("warning");
  });
});

describe("ActualSkillIssueSchema", () => {
  it("encodes and decodes MissingSkillMd", () => {
    const issue = ActualSkillIssue.MissingSkillMd({ path: "/test" });
    const encoded = Schema.encodeSync(ActualSkillIssueSchema)(issue);
    const decoded = Schema.decodeSync(ActualSkillIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes InvalidFrontmatter", () => {
    const issue = ActualSkillIssue.InvalidFrontmatter({ errors: ["error1", "error2"] });
    const encoded = Schema.encodeSync(ActualSkillIssueSchema)(issue);
    const decoded = Schema.decodeSync(ActualSkillIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes MissingDescription", () => {
    const issue = ActualSkillIssue.MissingDescription();
    const encoded = Schema.encodeSync(ActualSkillIssueSchema)(issue);
    const decoded = Schema.decodeSync(ActualSkillIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });
});

describe("SkillStateIssue constructors", () => {
  it("creates MissingFromDisk issue", () => {
    const issue = SkillStateIssue.MissingFromDisk({ name: "my-skill" });
    expect(issue._tag).toBe("MissingFromDisk");
    if (issue._tag === "MissingFromDisk") {
      expect(issue.name).toBe("my-skill");
    }
    expect(issue.severity).toBe("error");
  });

  it("creates NotInLockfile issue", () => {
    const issue = SkillStateIssue.NotInLockfile({ name: "orphaned-skill" });
    expect(issue._tag).toBe("NotInLockfile");
    if (issue._tag === "NotInLockfile") {
      expect(issue.name).toBe("orphaned-skill");
    }
    expect(issue.severity).toBe("warning");
  });
});

describe("SkillStateIssueSchema", () => {
  it("encodes and decodes MissingFromDisk", () => {
    const issue = SkillStateIssue.MissingFromDisk({ name: "test-skill" });
    const encoded = Schema.encodeSync(SkillStateIssueSchema)(issue);
    const decoded = Schema.decodeSync(SkillStateIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes NotInLockfile", () => {
    const issue = SkillStateIssue.NotInLockfile({ name: "orphan" });
    const encoded = Schema.encodeSync(SkillStateIssueSchema)(issue);
    const decoded = Schema.decodeSync(SkillStateIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });
});

describe("WorkspaceIssue constructors", () => {
  it("creates DuplicateName issue", () => {
    const paths = ["/skills/foo", "/skills/bar/foo"];
    const issue = WorkspaceIssue.DuplicateName({ name: "foo", paths });
    expect(issue._tag).toBe("DuplicateName");
    if (issue._tag === "DuplicateName") {
      expect(issue.name).toBe("foo");
      expect(issue.paths).toEqual(paths);
    }
    expect(issue.severity).toBe("error");
  });

  it("creates OrphanedSettingsRef issue", () => {
    const issue = WorkspaceIssue.OrphanedSettingsRef({ agent: "claude", skill: "missing-skill" });
    expect(issue._tag).toBe("OrphanedSettingsRef");
    if (issue._tag === "OrphanedSettingsRef") {
      expect(issue.agent).toBe("claude");
      expect(issue.skill).toBe("missing-skill");
    }
    expect(issue.severity).toBe("warning");
  });
});

describe("WorkspaceIssueSchema", () => {
  it("encodes and decodes DuplicateName", () => {
    const issue = WorkspaceIssue.DuplicateName({ name: "dup", paths: ["/a", "/b"] });
    const encoded = Schema.encodeSync(WorkspaceIssueSchema)(issue);
    const decoded = Schema.decodeSync(WorkspaceIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes OrphanedSettingsRef", () => {
    const issue = WorkspaceIssue.OrphanedSettingsRef({ agent: "cursor", skill: "old-skill" });
    const encoded = Schema.encodeSync(WorkspaceIssueSchema)(issue);
    const decoded = Schema.decodeSync(WorkspaceIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });
});

describe("AnyIssue union", () => {
  it("accepts ActualSkillIssue", () => {
    const issue: AnyIssue = ActualSkillIssue.MissingSkillMd({ path: "/test" });
    expect(issue._tag).toBe("MissingSkillMd");
  });

  it("accepts SkillStateIssue", () => {
    const issue: AnyIssue = SkillStateIssue.MissingFromDisk({ name: "test" });
    expect(issue._tag).toBe("MissingFromDisk");
  });

  it("accepts WorkspaceIssue", () => {
    const issue: AnyIssue = WorkspaceIssue.DuplicateName({ name: "dup", paths: ["/a"] });
    expect(issue._tag).toBe("DuplicateName");
  });
});

describe("AnyIssueSchema", () => {
  it("encodes and decodes ActualSkillIssue via AnyIssueSchema", () => {
    const issue = ActualSkillIssue.InvalidFrontmatter({ errors: ["test"] });
    const encoded = Schema.encodeSync(AnyIssueSchema)(issue);
    const decoded = Schema.decodeSync(AnyIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes SkillStateIssue via AnyIssueSchema", () => {
    const issue = SkillStateIssue.NotInLockfile({ name: "orphan" });
    const encoded = Schema.encodeSync(AnyIssueSchema)(issue);
    const decoded = Schema.decodeSync(AnyIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });

  it("encodes and decodes WorkspaceIssue via AnyIssueSchema", () => {
    const issue = WorkspaceIssue.OrphanedSettingsRef({ agent: "claude", skill: "test" });
    const encoded = Schema.encodeSync(AnyIssueSchema)(issue);
    const decoded = Schema.decodeSync(AnyIssueSchema)(encoded);
    expect(decoded).toEqual(issue);
  });
});
