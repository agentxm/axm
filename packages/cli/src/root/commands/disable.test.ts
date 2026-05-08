/**
 * Unit tests for the commands disable handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleDisableCommand, type DisableCommandHandlerArgs } from "./disable.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  commands: Record<string, unknown> = {},
  lockfileCommands: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  const configuredCommands = Object.keys(commands).length > 0 ? commands : undefined;
  writeWorkspaceFiles(axmDir, {
    agents,
    commands: configuredCommands,
    lockfileCommands: Object.keys(lockfileCommands).length > 0 ? lockfileCommands : undefined,
  });
};

const makeLockEntry = () => ({
  type: "local",
  path: "/installed",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agents: [],
});

const defaultArgs = (
  name: string,
  overrides: Partial<DisableCommandHandlerArgs> = {},
): DisableCommandHandlerArgs => ({
  name: extensionName(name),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands disable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-disable-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    return { ...ctx, fullLayer, provide: makeEffectProvide(fullLayer) };
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when command does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisableCommand(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).message).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when command is already disabled", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
        { "my-cmd": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.info.some((m) => m.includes("already disabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview", () => {
    it.effect("displays agents whose files would be removed in preview mode", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        {
          "my-cmd": {
            ...makeLockEntry(),
            agents: ["claude-code", "cursor"],
            renderedFiles: {
              "claude-code": [{ path: "/tmp/.claude/commands/my-cmd.md" }],
              cursor: [{ path: "/tmp/.cursor/commands/my-cmd.md" }],
            },
          },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd", { preview: true }));

          const allMessages = [...logs.info, ...logs.message];
          expect(
            allMessages.some((message) =>
              message.includes("Would remove rendered files from agents"),
            ),
          ).toBe(true);
          expect(
            allMessages.some((message) => message.includes("Files that would be removed")),
          ).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only disable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only disable (no lock entry)", () => {
    it.effect("disables a configured command with no lockfile entry", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { "my-cmd": "@acme/commands/my-cmd" }, {}, [
        "claude-code",
      ]);

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.commands?.["my-cmd"]).toEqual({
            source: "@acme/commands/my-cmd",
            enabled: false,
          });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves disable plan for enabled command", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        { "my-cmd": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.commands?.["my-cmd"]).toEqual({
            source: "@acme/commands/my-cmd",
            enabled: false,
          });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Implicit command disable (promotion)
  // ---------------------------------------------------------------------------

  describe("implicit command disable (lockfile-only entry promotion)", () => {
    it.effect("creates direct entry when disabling implicit command", () => {
      const { provide, logs } = makeLayers();
      // Implicit command: in lockfile but not in settings
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        {
          "my-cmd": {
            type: "registry",
            owner: "@acme",
            name: "my-cmd",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            agents: [],
          },
        },
        ["claude-code"],
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should have a new direct entry with enabled: false
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.commands?.["my-cmd"]).toEqual({
            source: "@acme/commands/my-cmd",
            enabled: false,
          });
        }),
      );
    });
  });
});
