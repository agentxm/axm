/**
 * Unit tests for the commands update handler.
 *
 * Tests validation logic for the update command.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleUpdateCommand, type UpdateCommandHandlerArgs } from "./update.js";

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

const defaultArgs = (
  overrides: Partial<UpdateCommandHandlerArgs> = {},
): UpdateCommandHandlerArgs => ({
  name: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands update.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => makeWorkspaceHandlerTestContext();

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it.effect("shows no commands message when none are installed", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs());

        expect(logs.info.some((m) => m.includes("No commands installed"))).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Name filter
  // ---------------------------------------------------------------------------

  it.effect("warns when named command is not installed", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs({ name: Option.some("nonexistent") }));

        expect(
          logs.info.some((m) => m.includes("No commands installed") || m.includes("nonexistent")),
        ).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  it.effect("displays commands that would be updated in preview mode", () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const sourcesLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive, sourcesLayer);
    const provide = makeEffectProvide(fullLayer);
    const { logs } = ctx;

    initWorkspace(path.join(tempDir, ".axm"), { "my-cmd": "@acme/commands/my-cmd" }, {});

    return provide(
      Effect.gen(function* () {
        // The handler will fail at source resolution but preview info should appear before that
        yield* handleUpdateCommand(defaultArgs({ preview: true })).pipe(
          Effect.catch(() => Effect.void),
        );

        expect(logs.info.some((m) => m.includes("Would update") && m.includes("my-cmd"))).toBe(
          true,
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Disabled commands skipped
  // ---------------------------------------------------------------------------

  it.effect("skips disabled commands during update", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
      {},
    );

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs());

        expect(logs.info.some((m) => m.includes("Skipping") || m.includes("No commands"))).toBe(
          true,
        );
      }),
    );
  });
});
