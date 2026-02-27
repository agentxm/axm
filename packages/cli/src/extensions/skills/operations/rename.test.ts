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
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { SkillPathSource } from "../paths.js";
import { sanitizeName } from "../utils.js";
import type { RenameSkillOperation } from "./rename.js";
import { renameSkill } from "./rename.js";

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
    ...taxonomyStubs,
    global: false,
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed("@community"),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(settingsSkills).map(([k, v]) => [
            k,
            {
              source: typeof v === "string" ? v : (v?.source ?? ""),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              packagingKind: "non-native" as const,
              isBuiltIn: false,
            },
          ]),
        ),
      ),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromNullable(lockfileSkills[name] as SkillLockEntry | undefined)),
    getSkillDir: (name: string, source?: SkillPathSource) => {
      const base = path.dirname(axmDir);
      // Use explicit source if provided, else look up lock entry
      const srcRefType =
        source?.refType ??
        ((lockfileSkills[name] as SkillLockEntry | undefined)?.type === "registry"
          ? "registry"
          : (lockfileSkills[name] as SkillLockEntry | undefined)?.type === "local"
            ? "local"
            : (lockfileSkills[name] as SkillLockEntry | undefined)?.type === "builtin"
              ? "builtin"
              : "git-hosted");
      if (srcRefType === "registry") {
        const namespace =
          source?.refType === "registry"
            ? source.namespace
            : "namespace" in (lockfileSkills[name] ?? {})
              ? (lockfileSkills[name] as { namespace: string }).namespace
              : "@community";
        // Resolve immutable registry name from lock entry, not user-facing name
        const lockEntry = lockfileSkills[name] as (SkillLockEntry & { name?: string }) | undefined;
        const dirName = lockEntry?.name ?? name;
        const sanitized = sanitizeName(dirName);
        const canonicalPath = path.join(base, ".axm", "extensions", namespace, "skills", sanitized);
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const sanitized = sanitizeName(name);
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: opts.renameSkillFn ?? (() => Effect.void),
    updateLockEntryAgents: opts.updateLockEntryAgentsFn ?? (() => Effect.void),
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "" }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
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

/** Creates a registry source lock entry. */
const makeRegistryLockEntry = (agents: string[], namespace = "@community") => ({
  type: "registry" as const,
  namespace,
  name: "my-skill",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "local",
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

    // Create canonical skill dir in external extensions
    const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", skillName);
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
        const newCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "renamed-skill",
        );
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
          path.join(base, ".axm", "extensions", "external", "skills", "renamed-skill", "SKILL.md"),
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

  describe("registry source", () => {
    /** Sets up a workspace with a registry-sourced skill canonical dir. */
    const setupRegistryWorkspace = (
      opts: {
        skillName?: string;
        namespace?: string;
        agents?: string[];
      } = {},
    ) => {
      const skillName = opts.skillName ?? "my-skill";
      const namespace = opts.namespace ?? "@community";
      const agents = opts.agents ?? ["claude-code"];

      const base = path.join(tmpDir, "project");
      const axmDir = path.join(base, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });

      // Create registry canonical skill dir with src/ subdirectory
      const canonicalPath = path.join(base, ".axm", "extensions", namespace, "skills", skillName);
      const srcPath = path.join(canonicalPath, "src");
      fs.mkdirSync(srcPath, { recursive: true });
      fs.writeFileSync(
        path.join(srcPath, "SKILL.md"),
        `---\nname: ${skillName}\ndescription: A registry skill\n---\n\n# ${skillName}`,
      );
      fs.writeFileSync(
        path.join(canonicalPath, "axm-skill.json"),
        JSON.stringify({ name: skillName, version: "1.0.0" }),
      );

      // Create agent symlinks pointing to src/ (not canonical root)
      for (const agentId of agents) {
        const agentDirMap: Record<string, string> = {
          "claude-code": ".claude/skills",
          cursor: ".cursor/skills",
        };
        const agentSkillsDir = agentDirMap[agentId];
        if (agentSkillsDir) {
          const agentSkillPath = path.join(base, agentSkillsDir, skillName);
          fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
          fs.symlinkSync(srcPath, agentSkillPath);
        }
      }

      return { base, axmDir, canonicalPath, srcPath };
    };

    it.effect("keeps registry directory unchanged on rename", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath, srcPath } = setupRegistryWorkspace({
          agents: ["claude-code"],
        });

        const result = yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeRegistryLockEntry(["claude-code"]),
              },
              settingsSkills: { "my-skill": "@community/skills/my-skill" },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Registry canonical dir stays the same (named after registry name, not alias)
        expect(fs.existsSync(canonicalPath)).toBe(true);
        expect(fs.existsSync(path.join(srcPath, "SKILL.md"))).toBe(true);

        // No renamed directory should exist
        const renamedCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "renamed-skill",
        );
        expect(fs.existsSync(renamedCanonical)).toBe(false);

        // Old agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // New agent symlink should point to the unchanged src/ directory
        const newSymlink = path.join(base, ".claude", "skills", "renamed-skill");
        expect(fs.existsSync(newSymlink)).toBe(true);
        expect(fs.lstatSync(newSymlink).isSymbolicLink()).toBe(true);
        const target = fs.readlinkSync(newSymlink);
        const resolved = path.resolve(path.dirname(newSymlink), target);
        expect(resolved).toBe(srcPath);
      }),
    );

    it.effect("updates SKILL.md frontmatter in src/ for registry skills", () =>
      Effect.gen(function* () {
        const { axmDir, srcPath } = setupRegistryWorkspace({ agents: ["claude-code"] });

        yield* renameSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeRegistryLockEntry(["claude-code"]),
              },
              settingsSkills: { "my-skill": "@community/skills/my-skill" },
            }),
          ),
        );

        // SKILL.md is in the unchanged directory
        const skillMd = fs.readFileSync(path.join(srcPath, "SKILL.md"), "utf-8");
        const parsed = matter(skillMd);
        expect(parsed.data["name"]).toBe("renamed-skill");
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
