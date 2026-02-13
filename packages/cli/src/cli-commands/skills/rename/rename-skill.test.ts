import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import matter from "gray-matter";
import { afterEach, beforeEach, vi } from "vitest";
import type { SkillLockEntry } from "../../../lockfile/schema.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import type { RenameSkillOperation } from "../operations.js";
import { renameSkill } from "./rename-skill.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for rename tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    lockfileSkills?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    settingsSkills?: Record<string, any>;
    renameSkillFn?: ReturnType<typeof vi.fn>;
    updateLockEntryAgentsFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills = opts.lockfileSkills ?? {};
  const settingsSkills = opts.settingsSkills ?? {};

  return {
    global: false,
    path: axmDir,
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getConfiguredRegistrySources: () => Effect.succeed([]),
    getConfiguredScope: () => Effect.succeed("@community"),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(settingsSkills).map(([k, v]) => [
            k,
            {
              source: Option.fromNullable(typeof v === "string" ? v : v?.source),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              managed: typeof v === "string" ? true : (v?.managed ?? true),
            },
          ]),
        ),
      ),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromNullable(lockfileSkills[name] as SkillLockEntry | undefined)),
    setSkill: () => Effect.void,
    removeSkill: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    renameSkill: opts.renameSkillFn ?? (() => Effect.void),
    updateLockEntryAgents: opts.updateLockEntryAgentsFn ?? (() => Effect.void),
    addConfiguredAgent: () => Effect.void,
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs));
};

/** Creates a minimal RenameSkillOperation for testing. */
const makeOp = (oldName = "my-skill", newName = "renamed-skill"): RenameSkillOperation => ({
  name: "rename-skill",
  args: { oldName, newName },
});

/** Creates a local source lock entry. */
const makeLocalLockEntry = (agents: string[]) => ({
  type: "local" as const,
  path: "/tmp/source",
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("renameSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rename-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with canonical skill dir and agent symlinks. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];

    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Create canonical skill dir
    const canonicalPath = path.join(base, ".agents", "skills", skillName);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: A test skill\n---\n\n# ${skillName}`,
    );

    // Create agent symlinks
    for (const agentId of agents) {
      const agentDirMap: Record<string, string> = {
        "claude-code": ".claude/skills",
        cursor: ".cursor/skills",
      };
      const agentSkillsDir = agentDirMap[agentId];
      if (agentSkillsDir) {
        const agentSkillPath = path.join(base, agentSkillsDir, skillName);
        fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
        fs.symlinkSync(canonicalPath, agentSkillPath);
      }
    }

    return { base, axmDir, canonicalPath };
  };

  describe("happy path", () => {
    it.effect("renames canonical directory and updates symlinks", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({ agents: ["claude-code"] });

        const result = yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("renamed-skill");

        // Old canonical dir should not exist
        expect(fs.existsSync(canonicalPath)).toBe(false);

        // New canonical dir should exist
        const newCanonical = path.join(base, ".agents", "skills", "renamed-skill");
        expect(fs.existsSync(newCanonical)).toBe(true);
        expect(fs.existsSync(path.join(newCanonical, "SKILL.md"))).toBe(true);

        // Old agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // New agent symlink should exist
        const newSymlink = path.join(base, ".claude", "skills", "renamed-skill");
        expect(fs.existsSync(newSymlink)).toBe(true);
        expect(fs.lstatSync(newSymlink).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("updates the name in SKILL.md frontmatter", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupWorkspace({ agents: ["claude-code"] });

        yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
            }),
          ),
        );

        const skillMd = fs.readFileSync(
          path.join(base, ".agents", "skills", "renamed-skill", "SKILL.md"),
          "utf-8",
        );
        const parsed = matter(skillMd);
        expect(parsed.data["name"]).toBe("renamed-skill");
        expect(parsed.data["description"]).toBe("A test skill");
      }),
    );

    it.effect("handles multiple agents", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupWorkspace({ agents: ["claude-code", "cursor"] });

        const result = yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code", "cursor"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Old symlinks removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(false);

        // New symlinks created
        expect(fs.existsSync(path.join(base, ".claude", "skills", "renamed-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "renamed-skill"))).toBe(true);
      }),
    );

    it.effect("calls ws.renameSkill with old and new names", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const renameSkillFn = vi.fn((_oldName: string, _newName: string) => Effect.void);

        yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
              renameSkillFn,
            }),
          ),
        );

        expect(renameSkillFn).toHaveBeenCalledOnce();
        expect(renameSkillFn).toHaveBeenCalledWith("my-skill", "renamed-skill");
      }),
    );

    it.effect("calls updateLockEntryAgents with new name and configured agents", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(updateLockEntryAgentsFn).toHaveBeenCalledOnce();
        expect(updateLockEntryAgentsFn).toHaveBeenCalledWith("renamed-skill", ["claude-code"]);
      }),
    );
  });

  describe("files-before-state ordering", () => {
    it.effect("does not update state when canonical dir rename fails", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // DON'T create canonical dir, so rename will fail

        const renameSkillFn = vi.fn(() => Effect.void);
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        const result = yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              settingsSkills: { "my-skill": "local:/tmp/source" },
              renameSkillFn,
              updateLockEntryAgentsFn,
            }),
          ),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        // State should NOT have been updated
        expect(renameSkillFn).not.toHaveBeenCalled();
        expect(updateLockEntryAgentsFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when lock entry is missing", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();

        const result = yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              settingsSkills: { "my-skill": "local:/tmp/source" },
            }),
          ),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );
  });
});
