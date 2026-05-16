/**
 * Unit tests for the list command handler.
 *
 * Tests the read-only display of installed skills with optional agent filtering.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { handleList } from "./list.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents }));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
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

describe("list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: {
    readonly machine?: boolean;
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
  }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const BaseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      ...opts?.wsOverrides,
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs, rendererState };
  };

  // ---------------------------------------------------------------------------
  // Display all skills
  // ---------------------------------------------------------------------------

  it.effect("displays all installed skills", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(),
      "skill-two": makeLockEntry(),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "skill-one" }),
            expect.objectContaining({ name: "skill-two" }),
          ]),
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty lockfile
  // ---------------------------------------------------------------------------

  it.effect("shows no skills message when lockfile is empty", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(logs.info.some((m) => m.includes("No skills installed"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by single agent
  // ---------------------------------------------------------------------------

  it.effect("filters skills by single agent", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-claude": makeLockEntry(["claude-code"]),
      "skill-cursor": makeLockEntry(["cursor"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code"] });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "skill-claude", agents: ["claude-code"] }),
        ]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by multiple agents (OR logic)
  // ---------------------------------------------------------------------------

  it.effect("filters by multiple agents using OR logic", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-claude": makeLockEntry(["claude-code"]),
      "skill-cursor": makeLockEntry(["cursor"]),
      "skill-other": makeLockEntry(["other-agent"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code", "cursor"] });

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "skill-claude" }),
            expect.objectContaining({ name: "skill-cursor" }),
          ]),
        );
        expect(rendererState.tables[0]?.items).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "skill-other" })]),
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Agent filter matches nothing
  // ---------------------------------------------------------------------------

  it.effect("shows empty message when agent filter matches nothing", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(["claude-code"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["nonexistent-agent"] });

        expect(logs.info).toContain("No skills matched the selected agent filter.");
      }),
    );
  });

  it.effect("emits machine-readable items for --json consumers", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(),
      "skill-two": makeLockEntry(["cursor"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 2,
          items: [
            { name: "skill-one", agents: ["claude-code"] },
            { name: "skill-two", agents: ["cursor"] },
          ],
        });
      }),
    );
  });
});
