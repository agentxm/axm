/**
 * Unit tests for the subagents disable handler.
 *
 * Tests implicit-to-configured promotion and configured disable paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import { handleDisableSubagent } from "./handler.js";

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
    agents: opts.agents,
    subagents: opts.subagents,
    lockfileSubagents: opts.lockfileSubagents,
  });
};

const makeLockEntry = () => ({
  type: "local",
  path: "/installed",
  agents: [],
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Stub CodingAgentRepository that returns no configured agents. */
const emptyAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

// Read the settings.json content after a handler run
const readSettings = (axmDir: string): Record<string, unknown> => {
  const raw = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents disable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-disable-handler-test-"));
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
  // Not found
  // ---------------------------------------------------------------------------

  it.effect("fails when subagent is not installed", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir);

    return provide(
      Effect.gen(function* () {
        const result = yield* handleDisableSubagent({
          name: "nonexistent",
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.result);

        expect(result._tag).toBe("Failure");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Already disabled
  // ---------------------------------------------------------------------------

  it.effect("reports no-op when subagent is already disabled", () => {
    const { provide, logs } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir, {
      subagents: {
        "my-subagent": { source: "@acme/subagents/my-subagent", enabled: false },
      },
      lockfileSubagents: {
        "my-subagent": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableSubagent({
          name: "my-subagent",
          yes: true,
          force: false,
          preview: false,
        });

        expect(logs.info.some((m) => m.includes("already disabled"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Implicit promotion: pack-provided subagent gets a direct settings entry
  // ---------------------------------------------------------------------------

  it.effect("promotes implicit subagent to configured entry with enabled: false", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    // Lockfile-only entry (no settings entry) = implicit
    initWorkspace(axmDir, {
      lockfileSubagents: {
        "pack-subagent": {
          ...makeLockEntry(),
          type: "registry",
          owner: "@acme",
          name: "pack-subagent",
          resolvedVersion: "1.0.0",
          integrity: "",
          sourceName: "default",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableSubagent({
          name: "pack-subagent",
          yes: true,
          force: false,
          preview: false,
        });

        // Verify settings now has a direct entry with enabled: false
        const settings = readSettings(axmDir);
        const subagents = settings["subagents"] as Record<string, unknown>;
        expect(subagents).toBeDefined();
        expect(subagents["pack-subagent"]).toBeDefined();

        const entry = subagents["pack-subagent"] as { source: string; enabled: boolean };
        expect(entry.enabled).toBe(false);
        expect(entry.source).toBe("@acme/subagents/pack-subagent");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Configured disable
  // ---------------------------------------------------------------------------

  it.effect("disables a configured subagent by toggling enabled to false", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir, {
      subagents: {
        "my-subagent": "@acme/subagents/my-subagent",
      },
      lockfileSubagents: {
        "my-subagent": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableSubagent({
          name: "my-subagent",
          yes: true,
          force: false,
          preview: false,
        });

        // Verify settings entry is now disabled
        const settings = readSettings(axmDir);
        const subagents = settings["subagents"] as Record<string, unknown>;
        const entry = subagents["my-subagent"] as { source: string; enabled: boolean };
        expect(entry.enabled).toBe(false);
      }),
    );
  });
});
