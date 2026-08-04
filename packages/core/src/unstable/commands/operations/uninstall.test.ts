import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { handle, renderedFilePath } from "../../test-helpers.js";
import { makeRegistryCommandLockEntry } from "../../workspace/test-stubs.js";
import type { UninstallCommandOperation } from "./uninstall.js";
import { uninstallCommand } from "./uninstall.js";
import { makeAgentRepoMock, makeWorkspaceMock } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeUninstallWorkspaceMock = (
  axmDir: string,
  lockfileCommands: Record<string, CommandLockEntry> = {},
  overrides?: {
    removeCommandFn?: (name: string) => Effect.Effect<void, AppError>;
  },
) => {
  let commands: Record<string, CommandLockEntry> = { ...lockfileCommands };
  const removeCommandFn = overrides?.removeCommandFn;

  const writeToDisk = () => {
    const lockfile: { lockfileVersion: number; commands: Record<string, unknown> } = {
      lockfileVersion: 3,
      commands: {},
    };
    for (const [k, v] of Object.entries(commands)) {
      lockfile.commands[k] = {
        ...v,
        installedAt: DateTime.formatIso(v.installedAt),
        updatedAt: DateTime.formatIso(v.updatedAt),
      };
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  };

  return makeWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedCommands: () => Effect.succeed(commands),
    getLockedCommand: (name: string) => Effect.succeed(Option.fromUndefinedOr(commands[name])),
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
  });
};

const withServices = (
  axmDir: string,
  lockfileCommands: Record<string, CommandLockEntry> = {},
  wsOverrides?: {
    removeCommandFn?: (name: string) => Effect.Effect<void, AppError>;
  },
) =>
  Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(makeUninstallWorkspaceMock(axmDir, lockfileCommands, wsOverrides)),
    Layer.succeed(CodingAgentRepository, makeAgentRepoMock()),
  );

const makeOp = (overrides: { commandName?: string } = {}): UninstallCommandOperation => ({
  name: "uninstall-command",
  args: {
    commandName: overrides.commandName ?? "my-command",
  },
});

const makeRegistryLockEntry = (): CommandLockEntry =>
  makeRegistryCommandLockEntry({
    owner: handle("@community"),
    name: "my-command",
    agents: [],
  });

const makeRegistryLockEntryYaml = () => ({
  type: "registry",
  owner: "@community",
  name: "my-command",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",

  publisherBindingId: "hbnd_test",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const writeLockfileYaml = (axmDir: string, commands: Record<string, unknown>) => {
  const lockfile = { lockfileVersion: 3, commands };
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
      owner?: string;
    } = {},
  ) => {
    const commandName = opts.commandName ?? "my-command";
    const owner = opts.owner ?? "@community";
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalPath = path.join(base, ".axm", "extensions", owner, "commands", commandName);
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

    it.effect("calls WorkspaceMutations.removeCommand", () =>
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

  describe("uninstall with rendered files in lockfile", () => {
    it.effect("removes rendered files from agents", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupWorkspace();

        // Create rendered files
        const renderedPath = path.join(base, ".claude-code", "commands", "my-command.md");
        fs.mkdirSync(path.dirname(renderedPath), { recursive: true });
        fs.writeFileSync(renderedPath, "rendered content");

        const lockEntry = {
          ...makeRegistryLockEntry(),
          agents: ["claude-code"],
          renderedFiles: {
            "claude-code": [{ path: renderedFilePath(".claude-code/commands/my-command.md") }],
          },
        };

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { "my-command": lockEntry })),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(renderedPath)).toBe(false);
      }),
    );
  });

  describe("command not installed", () => {
    it.effect("returns success when not in lockfile and no files on disk", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("not installed");
      }),
    );
  });

  describe("canonical directory already missing", () => {
    it.effect("ignores a stale receipt when canonical content is missing", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileCommands } = setupWorkspace({ createCanonical: false });
        const removeCommandFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands, { removeCommandFn })),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("not installed");
        expect(removeCommandFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("settings removal failure", () => {
    it.effect("surfaces removeCommand failure instead of reporting success", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileCommands } = setupWorkspace();
        const removeCommandFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        // The settings/lockfile entry is authoritative; if its removal fails the
        // operation must fail rather than leave the command present in the
        // lockfile but gone from disk.
        const error = yield* uninstallCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileCommands, { removeCommandFn })),
          Effect.flip,
        );

        expect(removeCommandFn).toHaveBeenCalled();
        expect(error.code).toBe("internal");
        expect(error.detail).toBe("write failed");
      }),
    );
  });
});
