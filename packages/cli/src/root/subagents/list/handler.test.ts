/**
 * Unit tests for the subagents list handler.
 *
 * Tests the read-only display of installed subagents.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { expectNoPlanEnvelope, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { INSTALL_SUBAGENT_FROM_REGISTRY } from "../../suggested-actions.js";
import { handleListSubagents } from "./handler.js";

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

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { readonly machine?: boolean }) =>
    makeWorkspaceHandlerTestContext(opts);

  // ---------------------------------------------------------------------------
  // Display all subagents
  // ---------------------------------------------------------------------------

  it.effect("displays all installed subagents", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "subagent-one": "@acme/subagents/subagent-one",
        "subagent-two": "@acme/subagents/subagent-two",
      },
      lockfileSubagents: {
        "subagent-one": makeLockEntry(),
        "subagent-two": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "subagent-one" }),
            expect.objectContaining({ name: "subagent-two" }),
          ]),
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it.effect("emits a single empty list payload when none are installed", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
          emptyMessage: "No subagents installed",
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.suggestions).toEqual([INSTALL_SUBAGENT_FROM_REGISTRY]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Configured subagents show as configured lifecycle
  // ---------------------------------------------------------------------------

  it.effect("shows configured lifecycle for settings-declared subagents", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "my-subagent": "@acme/subagents/my-subagent",
      },
      lockfileSubagents: {
        "my-subagent": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "my-subagent", lifecycle: "configured" }),
        ]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Disabled subagent display
  // ---------------------------------------------------------------------------

  it.effect("shows disabled status for disabled subagents", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "my-subagent": { source: "@acme/subagents/my-subagent", enabled: false },
      },
      lockfileSubagents: {
        "my-subagent": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "my-subagent", enabled: false }),
        ]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Multiple subagents from different sources
  // ---------------------------------------------------------------------------

  it.effect("displays all configured subagents", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "subagent-a": "@acme/subagents/subagent-a",
        "subagent-b": "@acme/subagents/subagent-b",
      },
      lockfileSubagents: {
        "subagent-a": makeLockEntry(),
        "subagent-b": makeLockEntry(),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "subagent-a" }),
            expect.objectContaining({ name: "subagent-b" }),
          ]),
        );
      }),
    );
  });

  it.effect("filters subagents by agent", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "subagent-claude": "@acme/subagents/subagent-claude",
        "subagent-cursor": "@acme/subagents/subagent-cursor",
      },
      lockfileSubagents: {
        "subagent-claude": makeLockEntry(["claude-code"]),
        "subagent-cursor": makeLockEntry(["cursor"]),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: ["claude-code"] });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "subagent-claude", agents: ["claude-code"] }),
        ]);
      }),
    );
  });

  it.effect("shows a filter-specific empty state when no subagents match the agent filter", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "subagent-claude": "@acme/subagents/subagent-claude",
      },
      lockfileSubagents: {
        "subagent-claude": makeLockEntry(["claude-code"]),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: ["cursor"] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
          emptyMessage: "No subagents matched the selected agent filter.",
        });
        expect(rendererState.logs).toEqual([]);
      }),
    );
  });

  it.effect("emits machine-readable items for --json consumers", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), {
      subagents: {
        "subagent-one": "@acme/subagents/subagent-one",
      },
      lockfileSubagents: {
        "subagent-one": makeLockEntry(["claude-code"]),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListSubagents({ agents: [] });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "subagent-one",
              lifecycle: "configured",
              enabled: true,
              agents: ["claude-code"],
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });
});
