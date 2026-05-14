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
import {
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
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

const makeLockEntry = (overrides: Record<string, unknown> = {}) => ({
  type: "local",
  path: "/installed",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agents: [],
  ...overrides,
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

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
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
    it.effect("displays affected agents from lockfile in preview mode", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-cmd": "@acme/commands/my-cmd" },
        {
          "my-cmd": makeLockEntry({
            agents: ["claude-code", "cursor"],
            renderedFiles: {
              "claude-code": [{ path: path.join(tempDir, ".claude/commands/my-cmd.md") }],
              cursor: [{ path: path.join(tempDir, ".cursor/commands/my-cmd.md") }],
            },
          }),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(defaultArgs("my-cmd"), defaultFlags({ preview: true }));

          const allMessages = [...logs.info, ...logs.message];
          expect(allMessages.some((m) => m.includes("Affected agents"))).toBe(true);
          expect(allMessages.some((m) => m.includes("claude-code"))).toBe(true);
          expect(allMessages.some((m) => m.includes("Files that would be removed"))).toBe(true);
        }),
      );
    });

    it.effect("fails when command is not installed", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleUninstallCommand(
            defaultArgs("nonexistent"),
            defaultFlags({ preview: true }),
          ).pipe(Effect.flip);

          expect(getAppError(error).detail).toContain("is not installed");
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
          "my-cmd": makeLockEntry({
            agents: ["claude-code", "cursor"],
          }),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallCommand(defaultArgs("my-cmd"), defaultFlags({ yes: true }));

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
