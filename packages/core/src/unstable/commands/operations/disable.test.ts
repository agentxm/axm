import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import type { AppError } from "../../app-error/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import type { ConfiguredCommand } from "../../workspace/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { expectRecord, handle, renderedFilePath } from "../../test-helpers.js";
import { makeRegistryCommandLockEntry } from "../../workspace/test-stubs.js";
import type { DisableCommandOperation } from "./disable.js";
import { disableCommand } from "./disable.js";
import { makeAgentRepoMock, makeWorkspaceMock } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const withServices = (
  axmDir: string,
  lockEntry?: CommandLockEntry,
  wsOverrides?: {
    setCommandLockFn?: (args: {
      name: string;
      lockEntry: unknown;
    }) => Effect.Effect<void, AppError>;
    removeCommandSettingsFn?: (name: string) => Effect.Effect<void, AppError>;
    updateCommandEntryFn?: (
      name: string,
      updater: Parameters<WorkspaceMutationsService["updateCommandEntry"]>[1],
    ) => Effect.Effect<void, AppError>;
    configuredCommands?: Record<string, ConfiguredCommand>;
  },
) => {
  const setCommandLockFn = wsOverrides?.setCommandLockFn;
  const updateCommandEntryFn = wsOverrides?.updateCommandEntryFn;
  const removeCommandSettingsFn = wsOverrides?.removeCommandSettingsFn;

  return Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(
      makeWorkspaceMock(axmDir, {
        getLockedCommands: () => Effect.succeed(lockEntry ? { "my-command": lockEntry } : {}),
        getLockedCommand: () => Effect.succeed(Option.fromUndefinedOr(lockEntry)),
        setCommandLock: setCommandLockFn
          ? (args: { name: string; lockEntry: unknown }) => setCommandLockFn(args)
          : () => Effect.void,
        updateCommandEntry: updateCommandEntryFn
          ? (
              name: string,
              updater: Parameters<WorkspaceMutationsService["updateCommandEntry"]>[1],
            ) => updateCommandEntryFn(name, updater)
          : () => Effect.void,
        removeCommandSettings: removeCommandSettingsFn
          ? (name: string) => removeCommandSettingsFn(name)
          : () => Effect.void,
        getConfiguredCommands: () => Effect.succeed(wsOverrides?.configuredCommands ?? {}),
      }),
    ),
    Layer.succeed(CodingAgentRepository, makeAgentRepoMock()),
  );
};

const makeOp = (commandName = "my-command"): DisableCommandOperation => ({
  name: "disable-command",
  args: { commandName },
});

const makeRegistryLockEntry = (
  overrides?: Partial<Extract<CommandLockEntry, { type: "registry" }>>,
): CommandLockEntry => {
  const {
    integrity,
    resolvedVersion,
    sourceName,
    agents,
    renderedFiles,
    sourceHash,
    retainedByPack,
  } = overrides ?? {};

  return makeRegistryCommandLockEntry({
    owner: handle("@community"),
    name: "my-command",
    ...(integrity !== undefined ? { integrity } : {}),
    ...(resolvedVersion !== undefined ? { resolvedVersion } : {}),
    ...(sourceName !== undefined ? { sourceName } : {}),
    ...(agents !== undefined ? { agents } : {}),
    ...(renderedFiles !== undefined ? { renderedFiles } : {}),
    ...(sourceHash !== undefined ? { sourceHash } : {}),
    ...(retainedByPack !== undefined ? { retainedByPack } : {}),
    ...(overrides?.installedAt !== undefined ? { installedAt: overrides.installedAt } : {}),
    ...(overrides?.updatedAt !== undefined ? { updatedAt: overrides.updatedAt } : {}),
  });
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disableCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "disable-command-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("settings-only path (no lock entry)", () => {
    it.effect("returns success when no lock entry", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const updateCommandEntryFn = vi.fn(() => Effect.void);

        const result = yield* disableCommand(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, undefined, {
              updateCommandEntryFn,
              configuredCommands: {
                "my-command": {
                  source: "@acme/commands/my-command",
                  enabled: true,
                  packagingKind: "non-native",
                },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Disabled my-command");
        expect(updateCommandEntryFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("lock-backed path", () => {
    it.effect("removes rendered files from agents", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create rendered files
        const renderedPath = path.join(base, ".claude-code", "commands", "my-command.md");
        fs.mkdirSync(path.dirname(renderedPath), { recursive: true });
        fs.writeFileSync(renderedPath, "rendered content");

        const lockEntry = makeRegistryLockEntry({
          renderedFiles: {
            "claude-code": [{ path: renderedFilePath(renderedPath) }],
          },
        });

        const result = yield* disableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockEntry)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(renderedPath)).toBe(false);
      }),
    );

    it.effect("preserves materialized files in .axm/extensions/", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        // Create canonical dir with files
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "my-command",
        );
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "my-command.md"), "Hello world");

        const lockEntry = makeRegistryLockEntry();
        const setCommandLockFn = vi.fn(() => Effect.void);

        const result = yield* disableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockEntry, { setCommandLockFn })),
        );

        expect(result.result).toBe("success");
        // Canonical files should still exist
        expect(fs.existsSync(path.join(canonicalPath, "my-command.md"))).toBe(true);
      }),
    );

    it.effect("clears agents in lock entry", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const lockEntry = makeRegistryLockEntry({ agents: ["claude-code"] });
        const setCommandLockFn = vi.fn(
          (_args: { name: string; lockEntry: unknown }) => Effect.void,
        );

        yield* disableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockEntry, { setCommandLockFn })),
        );

        expect(setCommandLockFn).toHaveBeenCalledOnce();
        const updatedLockEntry = expectRecord(setCommandLockFn.mock.calls[0]?.[0]?.lockEntry);
        expect(updatedLockEntry["agents"]).toEqual([]);
      }),
    );
  });
});
