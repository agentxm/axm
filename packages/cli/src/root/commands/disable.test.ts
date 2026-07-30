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
import { computeSourceHash } from "@agentxm/client-core/unstable/extensions";
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
import { handleDisableCommand, type DisableCommandHandlerArgs } from "./disable.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  commands: Record<string, unknown> = {},
  lockfileCommands: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
  opts?: { packs?: Record<string, unknown>; lockfilePacks?: Record<string, unknown> },
) => {
  const configuredCommands = Object.keys(commands).length > 0 ? commands : undefined;
  writeWorkspaceFiles(axmDir, {
    agents,
    commands: configuredCommands,
    packs: opts?.packs,
    lockfileCommands: Object.keys(lockfileCommands).length > 0 ? lockfileCommands : undefined,
    lockfilePacks: opts?.lockfilePacks,
    writeTrustFromLockfile: true,
  });
};

const makeLockEntry = () => ({
  type: "local",
  path: "installed",
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

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
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
          expect(getAppError(error).detail).toContain("is not installed");
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

          expect(logs.info.some((m) => m.includes("already disabled"))).toBe(false);
          expect(logs.success.some((m) => m.includes("already disabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(false);
        }),
      );
    });

    it.effect("emits JSON no-op when command is already disabled", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
        { "my-cmd": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.success).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Disable command",
            message: "Command 'my-cmd' is already disabled",
          });
          expect(result).toMatchObject({ planDescription: "Disable my-cmd" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview", () => {
    it.effect("displays configured agents affected in preview mode", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        {
          "my-cmd": {
            ...makeLockEntry(),
            agents: ["claude-code", "cursor"],
            renderedFiles: {
              "claude-code": [{ path: ".claude/commands/my-cmd.md" }],
              cursor: [{ path: ".cursor/commands/my-cmd.md" }],
            },
          },
        },
        ["claude-code", "cursor"],
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
          expect(allMessages.some((message) => message.includes("claude-code"))).toBe(true);
          expect(allMessages.some((message) => message.includes("cursor"))).toBe(true);
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

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

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

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

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

  describe("implicit command disable (pack-derived entry promotion)", () => {
    it.effect("creates direct entry when disabling implicit command", () => {
      const { provide, logs } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const commandDir = path.join(axmDir, "extensions", "@acme", "commands", "my-cmd");
      fs.mkdirSync(path.join(commandDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(commandDir, "command.json"),
        JSON.stringify({
          owner: "@acme",
          type: "command",
          name: "my-cmd",
          version: "1.0.0",
        }),
      );
      fs.writeFileSync(path.join(commandDir, "src", "my-cmd.md"), "# my-cmd");

      const packDir = path.join(axmDir, "extensions", "@acme", "packs", "starter-pack");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "starter-pack",
          version: "1.0.0",
          dependencies: {
            "@acme/commands/my-cmd": "^1.0.0",
          },
        }),
      );

      initWorkspace(
        axmDir,
        {},
        {
          "my-cmd": {
            type: "registry",
            owner: "@acme",
            name: "my-cmd",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            sourceHash: computeSourceHash("# my-cmd"),
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            agents: [],
          },
        },
        ["claude-code"],
        {
          packs: { "starter-pack": "@acme/packs/starter-pack" },
          lockfilePacks: {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              publisherBindingId: "hbnd_test",
              sourceHash: computePackageContentHashSync(packDir),
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              resolvedSkills: {},
              resolvedCommands: {
                "@acme/commands/my-cmd": {
                  version: "1.0.0",
                  publisherBindingId: "hbnd_test",
                },
              },
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisableCommand(defaultArgs("my-cmd"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          // Settings should have a new direct entry with enabled: false
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.commands?.["my-cmd"]).toEqual({
            source: "@acme/commands/my-cmd@^1.0.0",
            enabled: false,
          });
        }),
      );
    });
  });
});
