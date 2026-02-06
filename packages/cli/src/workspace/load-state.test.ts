/**
 * Tests for loadCurrentState - merges actual (disk) and locked (lockfile) state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import type * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceContextLegacy } from "./context-legacy.js";
import { loadCurrentState } from "./load-state.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

/**
 * Creates a minimal SKILL.md with frontmatter.
 */
const createSkillMd = (name: string, description?: string): string => {
  const descLine = description ? `description: ${description}\n` : "";
  return `---
name: ${name}
${descLine}---

# ${name}

Skill content.
`;
};

/**
 * Creates a lockfile YAML string with V2 structure.
 */
const createLockfileYaml = (
  skills: Record<
    string,
    {
      source: { _tag: string; owner?: string; repo?: string; path?: string };
      version?: string;
      gitTreeHash?: string;
      agents: string[];
    }
  >,
): string => {
  const entries = Object.entries(skills)
    .map(([name, skill]) => {
      const sourceYaml =
        skill.source._tag === "GitHub"
          ? `  source:
    _tag: GitHub
    owner: ${skill.source.owner}
    repo: ${skill.source.repo}${skill.source.path ? `\n    path: ${skill.source.path}` : ""}`
          : skill.source._tag === "Local"
            ? `  source:
    _tag: Local
    path: ${skill.source.path}`
            : "";
      const versionYaml = skill.version ? `\n  version: ${skill.version}` : "";
      const hashYaml = skill.gitTreeHash ? `\n  gitTreeHash: ${skill.gitTreeHash}` : "";
      const agentsYaml = `\n  agents:\n${skill.agents.map((a) => `    - ${a}`).join("\n")}`;
      return `${name}:\n${sourceYaml}${versionYaml}${hashYaml}${agentsYaml}
  installedAt: "2024-01-01T00:00:00.000Z"
  updatedAt: "2024-01-01T00:00:00.000Z"`;
    })
    .join("\n");

  return `lockfileVersion: 1
skills:
${entries ? `  ${entries.split("\n").join("\n  ")}` : "  {}"}
`;
};

describe("loadCurrentState", () => {
  let tempDir: string;
  let ws: WorkspaceContextLegacy;
  let extensionsDir: string;
  let externalSkillsDir: string;
  let registrySkillsDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(tmpBase, `axm-load-state-test-${Date.now()}`);
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );

    // Create workspace context pointing to temp dir
    const axmDir = nodePath.join(tempDir, ".axm");
    ws = { path: axmDir, interactive: false };
    extensionsDir = nodePath.join(axmDir, "extensions");
    externalSkillsDir = nodePath.join(extensionsDir, "external", "skills");
    registrySkillsDir = nodePath.join(extensionsDir, "@test-scope", "skills");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  describe("empty workspace", () => {
    it("returns empty state when workspace has no skills", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(ws.path, { recursive: true });
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toEqual([]);
      expect(result.issues).toEqual([]);
    });
  });

  describe("skill exists in both actual and locked", () => {
    it("creates SkillState with both actual and locked as Some", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill on disk
          const skillDir = nodePath.join(externalSkillsDir, "my-skill");
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "SKILL.md"),
            createSkillMd("my-skill", "A test skill"),
          );

          // Create lockfile with the skill
          const lockfileYaml = createLockfileYaml({
            "my-skill": {
              source: { _tag: "GitHub", owner: "owner", repo: "repo" },
              gitTreeHash: "abc123",
              agents: ["claude"],
            },
          });
          yield* fs.writeFileString(nodePath.join(ws.path, "axm-lock.yaml"), lockfileYaml);
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      const skill = result.skills[0];
      expect(skill?.name).toBe("my-skill");
      expect(Option.isSome(skill?.actual ?? Option.none())).toBe(true);
      expect(Option.isSome(skill?.locked ?? Option.none())).toBe(true);
      expect(skill?.issues).toEqual([]);
    });
  });

  describe("skill exists only on disk", () => {
    it("creates SkillState with NotInLockfile issue", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill on disk only (no lockfile entry)
          const skillDir = nodePath.join(externalSkillsDir, "orphan-skill");
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "SKILL.md"),
            createSkillMd("orphan-skill", "An orphan skill"),
          );

          // Create empty lockfile
          yield* fs.makeDirectory(ws.path, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      const skill = result.skills[0];
      expect(skill?.name).toBe("orphan-skill");
      expect(Option.isSome(skill?.actual ?? Option.none())).toBe(true);
      expect(Option.isNone(skill?.locked ?? Option.some({} as never))).toBe(true);
      expect(skill?.issues).toHaveLength(1);
      expect(skill?.issues[0]?._tag).toBe("NotInLockfile");
      expect(skill?.issues[0]?.severity).toBe("warning");
    });
  });

  describe("skill exists only in lockfile", () => {
    it("creates SkillState with MissingFromDisk issue", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create lockfile with a skill that doesn't exist on disk
          const lockfileYaml = createLockfileYaml({
            "missing-skill": {
              source: { _tag: "GitHub", owner: "owner", repo: "repo" },
              gitTreeHash: "abc123",
              agents: ["claude"],
            },
          });
          yield* fs.makeDirectory(ws.path, { recursive: true });
          yield* fs.writeFileString(nodePath.join(ws.path, "axm-lock.yaml"), lockfileYaml);
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      const skill = result.skills[0];
      expect(skill?.name).toBe("missing-skill");
      expect(Option.isNone(skill?.actual ?? Option.some({} as never))).toBe(true);
      expect(Option.isSome(skill?.locked ?? Option.none())).toBe(true);
      expect(skill?.issues).toHaveLength(1);
      expect(skill?.issues[0]?._tag).toBe("MissingFromDisk");
      expect(skill?.issues[0]?.severity).toBe("error");
    });
  });

  describe("duplicate skill names", () => {
    it("creates DuplicateName workspace issue when same skill appears in multiple locations", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill in external location
          const externalSkillDir = nodePath.join(externalSkillsDir, "dupe-skill");
          yield* fs.makeDirectory(externalSkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(externalSkillDir, "SKILL.md"),
            createSkillMd("dupe-skill", "External version"),
          );

          // Create skill with same name in registry location
          const registrySkillDir = nodePath.join(registrySkillsDir, "dupe-skill");
          yield* fs.makeDirectory(registrySkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(registrySkillDir, "SKILL.md"),
            createSkillMd("dupe-skill", "Registry version"),
          );

          // Create empty lockfile
          yield* fs.makeDirectory(ws.path, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      // Should have DuplicateName issue at workspace level
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?._tag).toBe("DuplicateName");
      expect(result.issues[0]?.severity).toBe("error");
      if (result.issues[0]?._tag === "DuplicateName") {
        expect(result.issues[0].name).toBe("dupe-skill");
        expect(result.issues[0].paths).toHaveLength(2);
      }
    });
  });

  describe("ActualSkill issues", () => {
    it("detects MissingSkillMd when SKILL.md is absent", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill directory without SKILL.md
          const skillDir = nodePath.join(externalSkillsDir, "no-md-skill");
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(nodePath.join(skillDir, "other-file.txt"), "content");

          // Create lockfile
          const lockfileYaml = createLockfileYaml({
            "no-md-skill": {
              source: { _tag: "GitHub", owner: "owner", repo: "repo" },
              gitTreeHash: "abc123",
              agents: ["claude"],
            },
          });
          yield* fs.writeFileString(nodePath.join(ws.path, "axm-lock.yaml"), lockfileYaml);
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      const skill = result.skills[0];
      expect(skill?.name).toBe("no-md-skill");
      expect(Option.isSome(skill?.actual ?? Option.none())).toBe(true);

      if (Option.isSome(skill?.actual ?? Option.none())) {
        const actual = (skill?.actual as Option.Some<{ issues: readonly { _tag: string }[] }>)
          .value;
        expect(actual.issues).toHaveLength(1);
        expect(actual.issues[0]?._tag).toBe("MissingSkillMd");
      }
    });

    it("detects MissingDescription when frontmatter has no description", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill without description
          const skillDir = nodePath.join(externalSkillsDir, "no-desc-skill");
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "SKILL.md"),
            createSkillMd("no-desc-skill"), // No description
          );

          // Create lockfile
          const lockfileYaml = createLockfileYaml({
            "no-desc-skill": {
              source: { _tag: "GitHub", owner: "owner", repo: "repo" },
              gitTreeHash: "abc123",
              agents: ["claude"],
            },
          });
          yield* fs.writeFileString(nodePath.join(ws.path, "axm-lock.yaml"), lockfileYaml);
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      const skill = result.skills[0];

      if (Option.isSome(skill?.actual ?? Option.none())) {
        const actual = (skill?.actual as Option.Some<{ issues: readonly { _tag: string }[] }>)
          .value;
        expect(actual.issues.some((i) => i._tag === "MissingDescription")).toBe(true);
      }
    });
  });

  describe("multiple skills", () => {
    it("loads multiple skills from different locations", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create external skill
          const externalSkillDir = nodePath.join(externalSkillsDir, "external-skill");
          yield* fs.makeDirectory(externalSkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(externalSkillDir, "SKILL.md"),
            createSkillMd("external-skill", "From external"),
          );

          // Create registry skill
          const registrySkillDir = nodePath.join(registrySkillsDir, "registry-skill");
          yield* fs.makeDirectory(registrySkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(registrySkillDir, "SKILL.md"),
            createSkillMd("registry-skill", "From registry"),
          );

          // Create lockfile with both
          const lockfileYaml = createLockfileYaml({
            "external-skill": {
              source: { _tag: "GitHub", owner: "owner", repo: "repo" },
              gitTreeHash: "ext123",
              agents: ["claude"],
            },
            "registry-skill": {
              source: { _tag: "GitHub", owner: "test-scope", repo: "skills" },
              gitTreeHash: "reg123",
              agents: ["cursor"],
            },
          });
          yield* fs.writeFileString(nodePath.join(ws.path, "axm-lock.yaml"), lockfileYaml);
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(2);
      const names = result.skills.map((s) => s.name).sort();
      expect(names).toEqual(["external-skill", "registry-skill"]);
      expect(result.issues).toEqual([]);
    });
  });

  describe("invalid lockfile YAML", () => {
    it("fails with WorkspaceError when lockfile contains invalid YAML syntax", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(ws.path, { recursive: true });
          // Invalid YAML - unclosed bracket
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {\n  foo: [unclosed\n",
          );
        }),
      );

      await expect(runEffect(loadCurrentState(ws))).rejects.toThrow(
        "Failed to parse lockfile YAML",
      );
    });

    it("fails with WorkspaceError when lockfile has invalid structure", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(ws.path, { recursive: true });
          // Invalid structure - lockfileVersion should be number, not string
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            'lockfileVersion: "one"\nskills: {}\n',
          );
        }),
      );

      await expect(runEffect(loadCurrentState(ws))).rejects.toThrow("Invalid lockfile format");
    });

    it("fails with WorkspaceError when skill entry has missing required fields", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(ws.path, { recursive: true });
          // Missing required 'agents', 'installedAt', 'updatedAt' fields
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            `lockfileVersion: 1
skills:
  my-skill:
    source: local
`,
          );
        }),
      );

      await expect(runEffect(loadCurrentState(ws))).rejects.toThrow("Invalid lockfile format");
    });
  });

  describe("scoped registry paths", () => {
    it("scans registry skills from @<scope>/skills/ paths", async () => {
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;

          // Create skill in @other-scope/skills/
          const otherScopeDir = nodePath.join(
            extensionsDir,
            "@other-scope",
            "skills",
            "scoped-skill",
          );
          yield* fs.makeDirectory(otherScopeDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(otherScopeDir, "SKILL.md"),
            createSkillMd("scoped-skill", "From other scope"),
          );

          // Create empty lockfile
          yield* fs.makeDirectory(ws.path, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(ws.path, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );
        }),
      );

      const result = await runEffect(loadCurrentState(ws));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("scoped-skill");
    });
  });
});
