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
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { computePackageContentHash } from "../../extensions/package-hash.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { handle } from "../../test-helpers.js";
import { makeRegistryCommandLockEntry } from "../../workspace/test-stubs.js";
import { TRUST_STATE_VERSION } from "../../trust/index.js";
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
  contentIdentity?: string,
) => {
  const setCommandFn = wsOverrides?.setCommandFn;
  const setCommandLockFn = wsOverrides?.setCommandLockFn;

  return Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(
      makeWorkspaceMock(axmDir, {
        getLockedCommands: () => Effect.succeed(lockEntry ? { "my-command": lockEntry } : {}),
        getLockedCommand: () => Effect.succeed(Option.fromUndefinedOr(lockEntry)),
        getTrustState: () =>
          Effect.succeed({
            trustStateVersion: TRUST_STATE_VERSION,
            records:
              lockEntry?.type === "registry"
                ? {
                    "command:my-command": {
                      extensionType: "command",
                      name: "my-command",
                      authority: "registry",
                      sourceIdentity: "@community/commands/my-command",
                      resolvedVersion: lockEntry.resolvedVersion,
                      publisherBindingId: lockEntry.publisherBindingId,
                      sourceName: lockEntry.sourceName,
                      integrity: lockEntry.integrity,
                      contentIdentity: contentIdentity ?? "0".repeat(64),
                    },
                  }
                : {},
          }),
        getConfiguredCommandEntries: () =>
          Effect.succeed({
            "my-command": {
              source: "@community/commands/my-command",
              enabled: false,
            },
          }),
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
    it.effect("fails when desired settings have no trusted canonical content", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const result = yield* enableCommand(makeOp()).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("not_found");
        }
      }),
    );
  });

  describe("lock-backed path", () => {
    it.effect("re-renders to agents and updates lock entry", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        // Create canonical dir with the command content file
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "my-command",
        );
        fs.mkdirSync(path.join(canonicalPath, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(canonicalPath, "command.json"),
          JSON.stringify({
            owner: "@community",
            type: "command",
            name: "my-command",
            version: "1.0.0",
          }),
        );
        fs.writeFileSync(path.join(canonicalPath, "src", "my-command.md"), "Hello world");

        const setCommandLockFn = vi.fn(
          (_args: { name: string; lockEntry: unknown }) => Effect.void,
        );
        const lockEntry = makeRegistryLockEntry();
        const contentIdentity = yield* computePackageContentHash(canonicalPath).pipe(
          Effect.provide(NodeServices.layer),
        );
        const services = withServices(axmDir, lockEntry, { setCommandLockFn }, contentIdentity);

        const result = yield* enableCommand(makeOp()).pipe(Effect.provide(services));

        expect(result.result).toBe("success");
        expect(result.message).toBe("Enabled my-command");
        if (result.result === "success") {
          expect(result.artifact).toEqual({
            path: ".claude-code/commands/my-command.md",
            scope: "project",
            agents: ["claude-code"],
            version: "1.0.0",
            change: "updated",
            fileCount: 1,
            targets: [
              {
                path: ".claude-code/commands/my-command.md",
                change: "updated",
                agentIds: ["claude-code"],
              },
            ],
          });
        }
        expect(setCommandLockFn).not.toHaveBeenCalled();
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
          expect(result.error.code).toBe("not_found");
        }
      }),
    );
  });
});
