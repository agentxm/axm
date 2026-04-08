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
import { Workspace } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { handle } from "../../test-helpers.js";
import { makeRegistryCommandLockEntry } from "../../workspace/test-stubs.js";
import type { EnableCommandOperation } from "./enable.js";
import { enableCommand } from "./enable.js";
import { makeAgentRepoMock, makeWorkspaceMock } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const withServices = (
  axmDir: string,
  lockEntry?: CommandLockEntry,
  wsOverrides?: {
    setCommandFn?: (args: { name: string; lockEntry: unknown }) => Effect.Effect<void, AppError>;
    setCommandLockFn?: (args: {
      name: string;
      lockEntry: unknown;
    }) => Effect.Effect<void, AppError>;
  },
) => {
  const setCommandFn = wsOverrides?.setCommandFn;
  const setCommandLockFn = wsOverrides?.setCommandLockFn;

  return Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(
      makeWorkspaceMock(axmDir, {
        getLockedCommands: () => Effect.succeed(lockEntry ? { "my-command": lockEntry } : {}),
        getLockedCommand: () => Effect.succeed(Option.fromUndefinedOr(lockEntry)),
        setCommand: setCommandFn
          ? (args: { name: string; lockEntry: unknown }) => setCommandFn(args)
          : () => Effect.void,
        setCommandLock: setCommandLockFn
          ? (args: { name: string; lockEntry: unknown }) => setCommandLockFn(args)
          : () => Effect.void,
      }),
    ),
    Layer.succeed(CodingAgentRepository, makeAgentRepoMock()),
  );
};

const makeOp = (commandName = "my-command"): EnableCommandOperation => ({
  name: "enable-command",
  args: { commandName },
});

const makeRegistryLockEntry = (): CommandLockEntry =>
  makeRegistryCommandLockEntry({
    owner: handle("@community"),
    name: "my-command",
    integrity: "",
    agents: [],
  });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("enableCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enable-command-")));
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

        const result = yield* enableCommand(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toBe("Enabled my-command");
      }),
    );
  });

  describe("lock-backed path", () => {
    it.effect("re-renders to agents and updates lock entry", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        // Create canonical dir with COMMAND.md
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "my-command",
        );
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "COMMAND.md"), "Hello world");

        const setCommandLockFn = vi.fn(
          (_args: { name: string; lockEntry: unknown }) => Effect.void,
        );
        const lockEntry = makeRegistryLockEntry();

        const result = yield* enableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockEntry, { setCommandLockFn })),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Enabled my-command");
        expect(setCommandLockFn).toHaveBeenCalledOnce();
      }),
    );

    it.effect("fails when canonical files are missing", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Don't create canonical dir

        const lockEntry = makeRegistryLockEntry();

        const result = yield* enableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockEntry)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("ENABLE_COMMAND_MISSING_FILES");
        }
      }),
    );
  });
});
