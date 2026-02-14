import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import type { SkillLockEntry } from "../../../lockfile/schema.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import type { DisableSkillOperation } from "../operations.js";
import { disableSkill } from "./disable-skill.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for disable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    lockfileSkills?: Record<string, any>;
    updateSkillEntryFn?: ReturnType<typeof vi.fn>;
    updateLockEntryAgentsFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills = opts.lockfileSkills ?? {};

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
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromNullable(lockfileSkills[name] as SkillLockEntry | undefined)),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    removeSkill: () => Effect.void,
    updateSkillEntry: opts.updateSkillEntryFn ?? (() => Effect.void),
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: opts.updateLockEntryAgentsFn ?? (() => Effect.void),
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "" }),
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs));
};

/** Creates a minimal DisableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): DisableSkillOperation => ({
  name: "disable-skill",
  args: { skillName },
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
const makeRegistryLockEntry = (agents: string[]) => ({
  type: "registry" as const,
  scope: "@community",
  name: "my-skill",
  resolvedVersion: "1.0.0",
  checksum: "sha256:abc123",
  sourceName: "local",
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disableSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "disable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with canonical skill dir and agent symlinks. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
      createCanonical?: boolean;
      createSymlinks?: boolean;
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const createCanonical = opts.createCanonical ?? true;
    const createSymlinks = opts.createSymlinks ?? true;

    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Create canonical skill dir
    const canonicalPath = path.join(base, ".agents", "skills", skillName);
    if (createCanonical) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), `# ${skillName}`);
    }

    // Create agent symlinks
    if (createSymlinks && createCanonical) {
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
    }

    return { base, axmDir, canonicalPath };
  };

  describe("happy path", () => {
    it.effect("removes agent symlinks but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({ agents: ["claude-code"] });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical dir should be preserved for re-enablement
        expect(fs.existsSync(canonicalPath)).toBe(true);

        // Agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );

    it.effect("removes symlinks for multiple agents but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code", "cursor"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");

        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(false);
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );

    it.effect("calls updateLockEntryAgents with empty array", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(updateLockEntryAgentsFn).toHaveBeenCalledOnce();
        expect(updateLockEntryAgentsFn).toHaveBeenCalledWith("my-skill", []);
      }),
    );

    it.effect("calls updateSkillEntry to set enabled: false", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);

        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              updateSkillEntryFn,
            }),
          ),
        );

        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
      }),
    );
  });

  describe("files-before-state ordering", () => {
    it.effect("updates state only after file removal succeeds", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        // Normal case: file removal should succeed, then state gets updated
        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              updateSkillEntryFn,
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(updateLockEntryAgentsFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("registry source", () => {
    it.effect("preserves registry canonical directory but removes agent symlinks", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create registry canonical dir
        const registryPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(registryPath, { recursive: true });
        fs.writeFileSync(path.join(registryPath, "SKILL.md"), "# my-skill");

        // Create agent symlink pointing to registry location
        const agentSkillPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
        fs.symlinkSync(registryPath, agentSkillPath);

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Registry canonical dir should be preserved
        expect(fs.existsSync(registryPath)).toBe(true);
        // Agent symlink should be removed
        expect(fs.existsSync(agentSkillPath)).toBe(false);
      }),
    );
  });

  describe("missing files", () => {
    it.effect("succeeds when canonical dir does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace({ createCanonical: false, createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
      }),
    );

    it.effect("succeeds when agent symlinks do not exist", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath } = setupWorkspace({ createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when lock entry is missing", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
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
