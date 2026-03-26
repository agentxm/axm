import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import type { SkillLockEntry } from "@axm.sh/core/unstable/lockfile";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { DisableSkillOperation } from "./disable.js";
import { disableSkill } from "./disable.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for disable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    lockfileSkills?: Record<string, SkillLockEntry>;
    updateSkillEntryFn?: ReturnType<typeof vi.fn>;
    updateLockEntryAgentsFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills: Record<string, SkillLockEntry> = opts.lockfileSkills ?? {};

  return {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed("@community"),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) => Effect.succeed(Option.fromUndefinedOr(lockfileSkills[name])),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
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
  return Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs));
};

/** Creates a minimal DisableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): DisableSkillOperation => ({
  name: "disable-skill",
  args: { skillName },
});

/** Creates a local source lock entry. */
const makeLocalLockEntry = (agents: string[]): SkillLockEntry => ({
  type: "local" as const,
  path: "/tmp/source",
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

/** Creates a registry source lock entry. */
const makeRegistryLockEntry = (agents: string[]): SkillLockEntry => ({
  type: "registry" as const,
  profile: "@community",
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

  describe("settings-only disable (no lock entry)", () => {
    it.effect("updates settings to enabled: false without lockfile or symlink work", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              updateSkillEntryFn,
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Settings should be updated
        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
        // Lock agents should NOT be updated (no lock entry)
        expect(updateLockEntryAgentsFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("implicit promotion disable", () => {
    it.effect("promotes implicit skill to configured entry with enabled: false", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const setSkillEntryFn = vi.fn((_name: string, _entry: unknown) => Effect.void);

        // Mock workspace where skill is implicit (lock exists but no settings entry)
        const mockWs: WorkspaceContextService = {
          ...taxonomyStubs,
          scope: "project",
          path: axmDir,
          baseDir: path.dirname(axmDir),
          resolvePlan: () =>
            Effect.succeed({
              _tag: "ExecutedPlan",
              name: "mock",
              description: Option.none(),
              jobs: [],
            }),
          getConfiguredSources: () => Effect.succeed([]),
          getConfiguredSourceByName: () => Effect.succeed(Option.none()),
          getRegistrySourceHosts: () => Effect.succeed([]),
          getConfiguredProfile: () => Effect.succeed("@community"),
          getDefaultProfile: () => Effect.succeed(Option.none()),
          addConfiguredSource: () => Effect.void,
          getConfiguredSkills: () => Effect.succeed({}),
          getInstalledSkills: () =>
            Effect.succeed({
              "my-skill": {
                lifecycle: "implicit" as const,
                source: Option.some("local:/tmp/source"),
                enabled: true as const,
                packagingKind: "non-native" as const,
                isBuiltIn: false,
              },
            }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () =>
            Effect.succeed({ "my-skill": makeLocalLockEntry(["claude-code"]) }),
          getLockedSkill: () => Effect.succeed(Option.some(makeLocalLockEntry(["claude-code"]))),
          getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
          setSkill: () => Effect.void,
          setSkillLock: () => Effect.void,
          removeSkill: () => Effect.void,
          removeSkillFromSettings: () => Effect.void,
          updateSkillEntry: () => Effect.void,
          setSkillEntry: setSkillEntryFn,
          renameSkill: () => Effect.void,
          updateLockEntryAgents: () => Effect.void,
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

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs))),
        );

        expect(result.result).toBe("success");
        // setSkillEntry should be called with source and enabled: false
        expect(setSkillEntryFn).toHaveBeenCalledOnce();
        expect(setSkillEntryFn).toHaveBeenCalledWith(
          "my-skill",
          expect.objectContaining({ enabled: false }),
        );
      }),
    );

    it.effect("fails when implicit skill has no derivable source", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Mock workspace where skill is implicit with no source
        const mockWs: WorkspaceContextService = {
          ...taxonomyStubs,
          scope: "project",
          path: axmDir,
          baseDir: path.dirname(axmDir),
          resolvePlan: () =>
            Effect.succeed({
              _tag: "ExecutedPlan",
              name: "mock",
              description: Option.none(),
              jobs: [],
            }),
          getConfiguredSources: () => Effect.succeed([]),
          getConfiguredSourceByName: () => Effect.succeed(Option.none()),
          getRegistrySourceHosts: () => Effect.succeed([]),
          getConfiguredProfile: () => Effect.succeed("@community"),
          getDefaultProfile: () => Effect.succeed(Option.none()),
          addConfiguredSource: () => Effect.void,
          getConfiguredSkills: () => Effect.succeed({}),
          getInstalledSkills: () =>
            Effect.succeed({
              "my-skill": {
                lifecycle: "implicit" as const,
                source: Option.none(),
                enabled: true as const,
                packagingKind: "non-native" as const,
                isBuiltIn: false,
              },
            }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () => Effect.succeed({}),
          getLockedSkill: () => Effect.succeed(Option.none()),
          getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
          setSkill: () => Effect.void,
          setSkillLock: () => Effect.void,
          removeSkill: () => Effect.void,
          removeSkillFromSettings: () => Effect.void,
          updateSkillEntry: () => Effect.void,
          setSkillEntry: () => Effect.void,
          renameSkill: () => Effect.void,
          updateLockEntryAgents: () => Effect.void,
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

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs))),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when implicit skill has no derivable source", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const mockWs: WorkspaceContextService = {
          ...taxonomyStubs,
          scope: "project",
          path: axmDir,
          baseDir: path.dirname(axmDir),
          resolvePlan: () =>
            Effect.succeed({
              _tag: "ExecutedPlan",
              name: "mock",
              description: Option.none(),
              jobs: [],
            }),
          getConfiguredSources: () => Effect.succeed([]),
          getConfiguredSourceByName: () => Effect.succeed(Option.none()),
          getRegistrySourceHosts: () => Effect.succeed([]),
          getConfiguredProfile: () => Effect.succeed("@community"),
          getDefaultProfile: () => Effect.succeed(Option.none()),
          addConfiguredSource: () => Effect.void,
          getConfiguredSkills: () => Effect.succeed({}),
          getInstalledSkills: () =>
            Effect.succeed({
              "my-skill": {
                lifecycle: "implicit" as const,
                source: Option.none(),
                enabled: true as const,
                packagingKind: "non-native" as const,
                isBuiltIn: false,
              },
            }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () => Effect.succeed({}),
          getLockedSkill: () => Effect.succeed(Option.none()),
          getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
          setSkill: () => Effect.void,
          setSkillLock: () => Effect.void,
          removeSkill: () => Effect.void,
          removeSkillFromSettings: () => Effect.void,
          updateSkillEntry: () => Effect.void,
          setSkillEntry: () => Effect.void,
          renameSkill: () => Effect.void,
          updateLockEntryAgents: () => Effect.void,
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

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs))),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Cannot determine source");
      }),
    );
  });
});
