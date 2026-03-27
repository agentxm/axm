import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import type { CommandLockEntry } from "@axm.sh/core/unstable/lockfile";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { UninstallCommandOperation } from "./uninstall.js";
import { uninstallCommand } from "./uninstall.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  lockfileCommands: Record<string, CommandLockEntry> = {},
  overrides?: {
    removeCommandFn?: ReturnType<typeof vi.fn>;
  },
): WorkspaceContextService => {
  let commands: Record<string, CommandLockEntry> = { ...lockfileCommands };
  const removeCommandFn = overrides?.removeCommandFn;

  const writeToDisk = () => {
    const lockfile: { lockfileVersion: number; commands: Record<string, unknown> } = {
      lockfileVersion: 1,
      commands: {},
    };
    for (const [k, v] of Object.entries(commands)) {
      lockfile.commands[k] = {
        ...v,
        installedAt: v.installedAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      };
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  };

  return {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed("@community"),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
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
    getLockedCommands: () => Effect.succeed(commands),
    getLockedCommand: (name: string) => Effect.succeed(Option.fromUndefinedOr(commands[name])),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand:
      removeCommandFn !== undefined
        ? (name: string) => removeCommandFn(name)
        : (name: string) =>
            Effect.sync(() => {
              const { [name]: _, ...rest } = commands;
              void _;
              commands = rest;
              writeToDisk();
            }),
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

const withServices = (
  axmDir: string,
  lockfileCommands: Record<string, CommandLockEntry> = {},
  wsOverrides?: {
    removeCommandFn?: ReturnType<typeof vi.fn>;
  },
) =>
  Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(makeWorkspaceMock(axmDir, lockfileCommands, wsOverrides)),
  );

const makeOp = (overrides: { commandName?: string } = {}): UninstallCommandOperation => ({
  name: "uninstall-command",
  args: {
    commandName: overrides.commandName ?? "my-command",
  },
});

const makeRegistryLockEntry = () => ({
  type: "registry" as const,
  profile: "@community",
  name: "my-command",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date(),
  updatedAt: new Date(),
});

const makeRegistryLockEntryYaml = () => ({
  type: "registry",
  profile: "@community",
  name: "my-command",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const writeLockfileYaml = (axmDir: string, commands: Record<string, unknown>) => {
  const lockfile = { lockfileVersion: 1, commands };
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstallCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-command-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const setupWorkspace = (
    opts: {
      commandName?: string;
      createCanonical?: boolean;
      profile?: string;
    } = {},
  ) => {
    const commandName = opts.commandName ?? "my-command";
    const profile = opts.profile ?? "@community";
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalPath = path.join(base, ".axm", "extensions", profile, "commands", commandName);
    if (opts.createCanonical !== false) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "run.sh"), "#!/bin/bash");
    }

    const lockfileCommands = { [commandName]: makeRegistryLockEntry() };
    writeLockfileYaml(axmDir, { [commandName]: makeRegistryLockEntryYaml() });

    return { base, axmDir, canonicalPath, lockfileCommands };
  };

  describe("full uninstall — lockfile entry exists", () => {
    it.effect("removes canonical dir and lockfile entry", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath, lockfileCommands } = setupWorkspace();

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-command");
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );

    it.effect("calls Workspace.removeCommand", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileCommands } = setupWorkspace();
        const removeCommandFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands, { removeCommandFn })),
        );

        expect(result.result).toBe("success");
        expect(removeCommandFn).toHaveBeenCalledOnce();
        expect(removeCommandFn).toHaveBeenCalledWith("my-command");
      }),
    );
  });

  describe("command not installed", () => {
    it.effect("returns no-op when not in lockfile and no files on disk", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("no-op");
        expect(result.message).toBe("not installed");
      }),
    );
  });

  describe("canonical directory already missing", () => {
    it.effect("still removes lockfile entry when canonical dir is missing", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileCommands } = setupWorkspace({ createCanonical: false });
        const removeCommandFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands, { removeCommandFn })),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-command");
        expect(removeCommandFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("settings removal failure", () => {
    it.effect("swallows removeCommand failure (warning, not error)", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileCommands } = setupWorkspace();
        const removeCommandFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands, { removeCommandFn })),
        );

        expect(result.result).toBe("success");
      }),
    );
  });
});
