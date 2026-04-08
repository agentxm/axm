/**
 * Unit tests for the subagent rename command handler.
 *
 * Tests validation logic, locally-authored restriction, and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@axm.sh/core/unstable/agents";
import { handleRenameSubagent, type RenameSubagentHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    subagents?: Record<string, unknown>;
    lockfileSubagents?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents ?? ["claude-code"],
    subagents:
      opts.subagents && Object.keys(opts.subagents).length > 0 ? opts.subagents : undefined,
    lockfileSubagents: opts.lockfileSubagents,
    lockfilePacks: opts.lockfilePacks,
  });
};

const makeLocalLockEntry = () => ({
  type: "local",
  path: "/installed",
  agents: [],
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeRegistryLockEntry = () => ({
  type: "registry",
  owner: "@acme",
  name: "my-agent",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  agents: [],
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  oldName: string,
  newName: string,
  overrides: Partial<RenameSubagentHandlerArgs> = {},
): RenameSubagentHandlerArgs => ({
  oldName,
  newName,
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

/** Stub CodingAgentRepository that returns no configured agents. */
const emptyAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents rename.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-rename-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: true },
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
  // Validation
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when old name does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRenameSubagent(defaultArgs("nonexistent", "new-name")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("not found");
        }),
      );
    });

    it.effect("rejects registry-installed subagent", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: { "my-agent": "@acme/subagents/my-agent" },
        lockfileSubagents: { "my-agent": makeRegistryLockEntry() },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRenameSubagent(defaultArgs("my-agent", "new-agent")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("registry-installed");
          expect(getAppError(error).what).toContain("cannot be renamed");
        }),
      );
    });

    it.effect("rejects when new name conflicts", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          "agent-a": "local",
          "agent-b": "local",
        },
        lockfileSubagents: {
          "agent-a": makeLocalLockEntry(),
          "agent-b": makeLocalLockEntry(),
        },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleRenameSubagent(defaultArgs("agent-a", "agent-b")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("already exists");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("renames a local subagent", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: { "old-agent": "local" },
        lockfileSubagents: { "old-agent": makeLocalLockEntry() },
      });
      // Create canonical subagent directory
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "subagents",
        "old-agent",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(
        path.join(canonicalDir, "SUBAGENT.md"),
        "---\nname: old-agent\n---\n# old-agent instructions",
      );

      return provide(
        Effect.gen(function* () {
          yield* handleRenameSubagent(defaultArgs("old-agent", "new-agent", { yes: true }));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });
});
