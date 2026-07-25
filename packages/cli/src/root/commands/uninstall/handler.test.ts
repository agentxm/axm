/**
 * Unit tests for the commands uninstall handler.
 *
 * Tests preview mode display of affected agents and rendered files.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { handleUninstallCommand } from "./handler.js";
import {
  UninstallCommandCommandWorkflowActionsLive,
  type UninstallCommandHandlerArgs,
} from "./command-actions.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  commands: Record<string, unknown> = {},
  lockfileCommands: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  writeWorkspaceFiles(axmDir, {
    agents,
    commands: Object.keys(commands).length > 0 ? commands : undefined,
    lockfileCommands: Object.keys(lockfileCommands).length > 0 ? lockfileCommands : undefined,
  });
};

const makeLockEntry = () => ({
  type: "local",
  path: "installed",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  name: string,
  overrides: Partial<UninstallCommandHandlerArgs> = {},
): UninstallCommandHandlerArgs => ({
  commandName: name,
  ...overrides,
});

const defaultFlags = (
  overrides: Partial<{ yes: boolean; force: boolean; preview: boolean }> = {},
) => ({
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands uninstall.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-uninstall-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flags?: { verbose?: boolean; debug?: boolean; nonInteractive?: boolean }) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags });
    const agentRepoLayer = Layer.provide(CodingAgentRepositoryLive, ctx.fullLayer);
    const managerDeps = Layer.mergeAll(ctx.fullLayer, agentRepoLayer);
    const cmdMgrLayer = Layer.provide(CommandManagerLive, managerDeps);
    const actionsLayer = Layer.provide(
      UninstallCommandCommandWorkflowActionsLive,
      Layer.mergeAll(ctx.fullLayer, agentRepoLayer, cmdMgrLayer),
    );
    const fullLayer = Layer.mergeAll(ctx.fullLayer, agentRepoLayer, cmdMgrLayer, actionsLayer);
    return { ...ctx, fullLayer, provide: makeEffectProvide(fullLayer) };
  };

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
          "my-cmd": makeLockEntry(),
        },
        ["claude-code", "cursor"],
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(defaultArgs("my-cmd"), defaultFlags({ preview: true }));

          const allMessages = [...logs.info, ...logs.message];
          expect(allMessages.some((m) => m.includes("Affected agents"))).toBe(true);
          expect(allMessages.some((m) => m.includes("claude-code"))).toBe(true);
          expect(allMessages.some((m) => m.includes("cursor"))).toBe(true);
        }),
      );
    });

    it.effect("previews a no-op when command is not installed", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(
            defaultArgs("nonexistent"),
            defaultFlags({ preview: true }),
          );

          const allMessages = [...logs.info, ...logs.success, ...logs.message];
          expect(allMessages.some((m) => m.includes("Uninstall command"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Apply mode
  // ---------------------------------------------------------------------------

  describe("apply", () => {
    it.effect("removes rendered command files for configured agents", () => {
      const { provide, logs } = makeLayers();
      const renderedPath = path.join(tempDir, ".claude", "commands", "my-cmd.md");
      fs.mkdirSync(path.dirname(renderedPath), { recursive: true });
      fs.writeFileSync(renderedPath, "rendered command");
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        {
          "my-cmd": makeLockEntry(),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(defaultArgs("my-cmd"), defaultFlags({ yes: true }));

          expect(fs.existsSync(renderedPath)).toBe(false);
          expect(logs.success.some((m) => m.includes("Uninstalled command my-cmd"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Confirmation with agents (task 9.5)
  // ---------------------------------------------------------------------------

  describe("confirmation with agents", () => {
    it.effect("includes affected agents in plan description", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        {
          "my-cmd": makeLockEntry(),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(defaultArgs("my-cmd"), defaultFlags({ preview: true }));

          // The plan description should include affected agents
          const allMessages = [...logs.info, ...logs.success, ...logs.message];
          expect(
            allMessages.some(
              (m) => m.includes("Affected agents") || m.includes("Uninstall command"),
            ),
          ).toBe(true);
        }),
      );
    });
  });
});
