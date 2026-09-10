/**
 * Unit tests for the subagent enable command handler.
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
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import {
  expectNoOpPlanResult,
  getAppError,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/extension-workspace";
import { handleEnableSubagent, type EnableSubagentHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    subagents?: Record<string, unknown>;
    lockfileSubagents?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents ?? ["claude-code"],
    subagents:
      opts.subagents && Object.keys(opts.subagents).length > 0 ? opts.subagents : undefined,
    lockfileSubagents: opts.lockfileSubagents,
  });
};

const makeSubagentLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  name: string,
  overrides: Partial<EnableSubagentHandlerArgs> = {},
): EnableSubagentHandlerArgs => ({
  name,
  preview: false,
  ...overrides,
});

/** Stub CodingAgentRepository that returns no configured agents. */
const emptyAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents enable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-enable-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext({
      ...opts,
      flags: { ...opts?.flags, nonInteractive: true },
    });
    const agentRepoLayer = Layer.succeed(CodingAgentRepository, emptyAgentRepo);
    const fullLayer = Layer.mergeAll(ctx.fullLayer, agentRepoLayer);
    return {
      ...ctx,
      provide: <A, E>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
        effect: Effect.Effect<A, E, any>,
      ) => effect.pipe(Effect.provide(fullLayer)),
    };
  };

  // ---------------------------------------------------------------------------
  // Validation: subagent not found
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when subagent does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnableSubagent(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when subagent is already enabled", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: { "my-agent": "local" },
        lockfileSubagents: { "my-agent": makeSubagentLockEntry() },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleEnableSubagent(defaultArgs("my-agent"));

          expect(logs.info.some((m) => m.includes("already enabled"))).toBe(false);
          expect(logs.success.some((m) => m.includes("already enabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(false);
        }),
      );
    });

    it.effect("emits JSON no-op when subagent is already enabled", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: { "my-agent": "local" },
        lockfileSubagents: { "my-agent": makeSubagentLockEntry() },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleEnableSubagent(defaultArgs("my-agent"));

          expect(logs.success).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Enable subagent",
            message: "Subagent 'my-agent' is already enabled",
          });
          expect(result).toMatchObject({ planDescription: "Enable my-agent" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only enable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only enable (no lock entry)", () => {
    it.effect("refuses to enable a configured-disabled subagent without trusted content", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          "my-agent": {
            source: "@acme/subagents/my-agent",
            enabled: false,
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleEnableSubagent(defaultArgs("my-agent"));

          // Apply mode renders no planned block; the refusal is the terminal
          // failed-outcome block.
          expect(logs.success).toEqual([]);
          expect(logs.error[0]).toBe("Failed to enable 1 subagent");
          expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual(
            expect.objectContaining({
              _tag: "rows",
              rows: expect.arrayContaining([
                expect.objectContaining({
                  _tag: "row",
                  change: "failed",
                  cells: expect.arrayContaining([
                    "my-agent",
                    'Accepted subagent content for "my-agent" is not usable (not_found)',
                  ]),
                }),
              ]),
            }),
          );

          // Settings should show re-enabled (collapsed to string form)
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.subagents?.["my-agent"]).toEqual({
            source: "@acme/subagents/my-agent",
            enabled: false,
          });
        }),
      );
    });
  });
});
