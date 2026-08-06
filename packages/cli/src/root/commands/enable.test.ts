/**
 * Unit tests for the commands enable handler.
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
import {
  computePackageContentHashSync,
  extensionName,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleEnableCommand, type EnableCommandHandlerArgs } from "./enable.js";

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
    owner: "@acme",
    commands: configuredCommands,
    lockfileCommands: Object.keys(lockfileCommands).length > 0 ? lockfileCommands : undefined,
    writeTrustFromLockfile: true,
  });
};

const makeLockEntry = (sourceHash?: string) => ({
  type: "local",
  path: "installed",
  ...(sourceHash === undefined ? {} : { sourceHash }),
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agents: [],
});

const defaultArgs = (
  name: string,
  overrides: Partial<EnableCommandHandlerArgs> = {},
): EnableCommandHandlerArgs => ({
  name: extensionName(name),
  yes: true,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands enable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-enable-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    return { ...ctx, fullLayer, provide: makeEffectProvide(fullLayer) };
  };

  // ---------------------------------------------------------------------------
  // Validation: command not found
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when command does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnableCommand(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when command is already enabled", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        { "my-cmd": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd"));

          expect(logs.info.some((m) => m.includes("already enabled"))).toBe(false);
          expect(logs.success.some((m) => m.includes("already enabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(false);
        }),
      );
    });

    it.effect("emits JSON no-op when command is already enabled", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        { "my-cmd": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd"));

          expect(logs.success).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Enable command",
            message: "Command 'my-cmd' is already enabled",
          });
          expect(result).toMatchObject({ planDescription: "Enable my-cmd" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview", () => {
    it.effect("displays agents that would be re-rendered in preview mode", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": { source: "./installed", enabled: false } },
        {
          "my-cmd": {
            ...makeLockEntry(),
            agents: ["claude-code", "cursor"],
          },
        },
        ["claude-code", "cursor"],
      );

      // Create canonical command directory so the enable operation can read command files
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "commands",
        "my-cmd",
        "src",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "my-cmd.md"), "# my-cmd");

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd", { preview: true }));

          const allMessages = [...logs.info, ...logs.message];
          expect(
            allMessages.some(
              (m) =>
                m.includes("Would re-render to configured agents") || m.includes("Would render"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("shows configured agents when no lock entry agents exist", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
        { "my-cmd": makeLockEntry() },
        ["claude-code"],
      );

      // Create canonical command directory
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "commands",
        "my-cmd",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "my-cmd.md"), "# my-cmd");

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd", { preview: true }));

          const allMessages = [...logs.info, ...logs.message];
          expect(
            allMessages.some(
              (m) =>
                m.includes("Would render to configured agents") || m.includes("Would re-render"),
            ),
          ).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only enable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only enable (no lock entry)", () => {
    it.effect("refuses to enable a configured-disabled command without trusted content", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        {
          "my-cmd": {
            source: "@acme/commands/my-cmd",
            enabled: false,
          },
        },
        {},
        ["claude-code"],
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd"));

          expect(logs.success).toEqual(["  + my-cmd"]);

          // Settings should show re-enabled (collapsed to string form)
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
    it.effect("builds and resolves enable plan for disabled command", () => {
      const { provide, logs } = makeLayers();

      // Create canonical command directory so the enable operation can read command files
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "commands",
        "my-cmd",
        "src",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(
        path.join(canonicalDir, "..", "command.json"),
        JSON.stringify({
          owner: "@acme",
          type: "command",
          name: "my-cmd",
          version: "1.0.0",
        }),
      );
      fs.writeFileSync(path.join(canonicalDir, "my-cmd.md"), "# my-cmd");
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": { source: "./installed", enabled: false } },
        {
          "my-cmd": makeLockEntry(computePackageContentHashSync(path.dirname(canonicalDir))),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnableCommand(defaultArgs("my-cmd"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          // Settings should show re-enabled (collapsed to string form)
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.commands?.["my-cmd"]).toBe("./installed");
        }),
      );
    });
  });
});
