/**
 * Unit tests for the commands list handler.
 *
 * Tests the read-only display of installed commands with optional filtering.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleListCommands } from "./list.js";

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
  path: "/installed",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agents: [],
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-list-handler-test-"));
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
    const baseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      ...opts?.wsOverrides,
    };
    const wsLayer = Layer.provide(coreWorkspaceLayer(wsOptions), baseLayer);
    const fullLayer = Layer.mergeAll(baseLayer, wsLayer);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper hides layer variance
      provide: <A, E>(effect: Effect.Effect<A, E, any>) => effect.pipe(Effect.provide(fullLayer)),
      logs: logsByTag(rendererState),
      rendererState,
    };
  };

  // ---------------------------------------------------------------------------
  // Display all commands
  // ---------------------------------------------------------------------------

  it.effect("displays all installed commands", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "cmd-one": "@acme/commands/cmd-one", "cmd-two": "@acme/commands/cmd-two" },
      { "cmd-one": makeLockEntry(), "cmd-two": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands();

        expect(rendererState.tables).toHaveLength(1);
        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "cmd-one" }),
            expect.objectContaining({ name: "cmd-two" }),
          ]),
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it.effect("shows no commands message when none are installed", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands();

        expect(logs.info.some((m) => m.includes("No commands installed"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Enabled/disabled status display
  // ---------------------------------------------------------------------------

  it.effect("shows enabled status for active commands", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": "@acme/commands/my-cmd" },
      { "my-cmd": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands();

        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "my-cmd", enabled: true }),
        ]);
      }),
    );
  });

  it.effect("shows disabled status for disabled commands", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
      { "my-cmd": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands();

        expect(rendererState.tables[0]?.items).toEqual([
          expect.objectContaining({ name: "my-cmd", enabled: false }),
        ]);
      }),
    );
  });

  it.effect("emits machine-readable items for --json consumers", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "cmd-one": "@acme/commands/cmd-one" },
      { "cmd-one": makeLockEntry() },
    );

    return provide(
      Effect.gen(function* () {
        yield* handleListCommands();

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "cmd-one",
              lifecycle: "configured",
              enabled: true,
              source: "@acme/commands/cmd-one",
            },
          ],
        });
      }),
    );
  });
});
