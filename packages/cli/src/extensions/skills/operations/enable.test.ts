import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { makeCliError } from "../../../cli-error/index.js";
import type { SkillLockEntry } from "../../../lockfile/schema.js";
import { ClackLogTestLayer } from "../../../clack-effect/log/ClackLogTest.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import { sanitizeName } from "../utils.js";
import type { EnableSkillOperation } from "./enable.js";
import { enableSkill } from "./enable.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for enable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    lockfileSkills?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    settingsSkills?: Record<string, any>;
    updateSkillEntryFn?: ReturnType<typeof vi.fn>;
    updateLockEntryAgentsFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills = opts.lockfileSkills ?? {};
  const settingsSkills = opts.settingsSkills ?? {};

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
    getInstalledSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(settingsSkills).map(([k, v]) => [
            k,
            {
              lifecycle: "configured" as const,
              source: typeof v === "string" ? v : (v?.source ?? ""),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              packagingKind: "non-native" as const,
              isBuiltIn: false,
            },
          ]),
        ),
      ),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(lockfileSkills[name] as SkillLockEntry | undefined)),
    getSkillDir: (name: string) => {
      const base = path.dirname(axmDir);
      const sanitized = sanitizeName(name);
      const lockEntry = lockfileSkills[name] as SkillLockEntry | undefined;
      if (lockEntry === undefined) {
        return Effect.fail(
          makeCliError({
            code: "SKILL_NOT_LOCKED",
            what: `Skill "${name}" not found in lockfile`,
          }),
        );
      }
      if (lockEntry.type === "registry") {
        const namespace =
          "namespace" in lockEntry ? (lockEntry as { namespace: string }).namespace : "@community";
        const canonicalPath = path.join(base, ".axm", "extensions", namespace, "skills", sanitized);
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
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
  return Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs), ClackLogTestLayer);
};

/** Creates a minimal EnableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): EnableSkillOperation => ({
  name: "enable-skill",
  args: { skillName },
});

/** Creates a local source lock entry for the in-memory mock (Date objects). */
const makeLocalLockEntry = (agents: string[], sourcePath = "/tmp/source") => ({
  type: "local" as const,
  path: sourcePath,
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

/** Creates a registry source lock entry for the in-memory mock (Date objects). */
const makeRegistryLockEntry = (agents: string[]) => ({
  type: "registry" as const,
  namespace: "@community",
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

describe("enableSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with .axm dir and canonical skill files already present. */
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

    // Create canonical skill files at the external extensions path
    const canonicalDir = path.join(base, ".axm", "extensions", "external", "skills", skillName);
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), `# ${skillName}`);
    fs.writeFileSync(path.join(canonicalDir, "prompt.md"), "prompt content");

    return { base, axmDir, canonicalDir, skillName, agents };
  };

  describe("happy path", () => {
    it.effect("creates agent symlinks from existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace();

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical location should still have files
        expect(fs.existsSync(path.join(canonicalDir, "SKILL.md"))).toBe(true);

        // Agent symlink should exist
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("handles multiple agents concurrently", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupWorkspace({ agents: ["claude-code", "cursor"] });

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Both agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("calls updateLockEntryAgents with configured agents", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(updateLockEntryAgentsFn).toHaveBeenCalledOnce();
        expect(updateLockEntryAgentsFn).toHaveBeenCalledWith("my-skill", ["claude-code"]);
      }),
    );

    it.effect("calls updateSkillEntry to set enabled: true", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
              updateSkillEntryFn,
            }),
          ),
        );

        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
      }),
    );
  });

  describe("missing canonical directory", () => {
    it.effect("fails when canonical directory does not exist", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const updateSkillEntryFn = vi.fn(() => Effect.void);
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
              updateSkillEntryFn,
              updateLockEntryAgentsFn,
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
        // State should NOT have been updated
        expect(updateSkillEntryFn).not.toHaveBeenCalled();
        expect(updateLockEntryAgentsFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("registry source", () => {
    it.effect("uses registry canonical path for registry lock entries", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");

        // Create registry-style canonical directory with src subdirectory
        const registryCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        const registrySrcDir = path.join(registryCanonical, "src");
        fs.mkdirSync(registrySrcDir, { recursive: true });
        fs.writeFileSync(path.join(registrySrcDir, "SKILL.md"), "# my-skill");

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry([]) },
              settingsSkills: {
                "my-skill": {
                  source: "@community/skills/my-skill",
                  enabled: false,
                },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Agent symlink should point to registry src path
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
      }),
    );
  });

  describe("settings-only enable (no lock entry)", () => {
    it.effect("updates settings to enabled: true without lockfile or symlink work", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
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
        // No agent symlinks should have been created (no canonical dir)
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when canonical directory is missing (lock entry present)", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false },
              },
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );
  });
});
