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
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import type { RegistryCommandRef } from "@agentxm/client-core/unstable/commands";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { exactVersion, extensionName, handle, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
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
  source: Option.none(),
  names: [],
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

const makeRegistryRef = (name = "my-cmd"): RegistryCommandRef => ({
  type: "command",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL("file:///tmp/registry"),
    owner: Option.none(),
  },
  command: { name: extensionName(name) },
  owner: handle("@acme"),
  name: extensionName(name),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  publisherBindingId: "hbnd_test",
  packages: [],
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

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) =>
    makeWorkspaceHandlerTestContext(opts);

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it.effect("shows no commands message when none are installed", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs());

        expect(logs.success.some((m) => m.includes("No commands installed"))).toBe(true);
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
        yield* handleUpdateCommand(defaultArgs({ source: Option.some("nonexistent") }));

        expect(
          logs.success.some(
            (m) => m.includes("No commands installed") || m.includes("nonexistent"),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("updates a command when positional name matches an installed command", () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const sourcesLayer = Layer.succeed(SourceHostProviders, {
      find: () => Effect.succeed([makeRegistryRef("my-cmd")]),
      fetch: () => Effect.die("unused"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive, sourcesLayer);
    const provide = makeEffectProvide(fullLayer);

    initWorkspace(path.join(tempDir, ".axm"), { "my-cmd": path.join(tempDir, "my-cmd") }, {});

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs({ source: Option.some("my-cmd"), preview: true }));

        expect(ctx.logs.info.some((message) => message.includes("Would update 1 command"))).toBe(
          true,
        );
        expect(ctx.logs.warn).toEqual([]);
      }),
    );
  });

  it.effect("reports no-op when positional name matches no installed command", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { "my-cmd": path.join(tempDir, "my-cmd") }, {});

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs({ names: ["missing-cmd"] }));

        expect(logs.success).toContain("No installed commands match the --name filter.");
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update commands",
          message: "No installed commands match the --name filter.",
        });
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  it.effect("displays commands that would be updated in preview mode", () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const sourcesLayer = Layer.succeed(SourceHostProviders, {
      find: () => Effect.succeed([makeRegistryRef()]),
      fetch: () => Effect.die("unused"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive, sourcesLayer);
    const provide = makeEffectProvide(fullLayer);
    const { logs } = ctx;

    initWorkspace(path.join(tempDir, ".axm"), { "my-cmd": path.join(tempDir, "my-cmd") }, {});

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs({ preview: true }));

        const allMessages = [...logs.info, ...logs.message];
        expect(
          allMessages.some((message) => message.includes("Would update 1 command")) &&
            allMessages.some((message) => message.includes("my-cmd")),
        ).toBe(true);
      }),
    );
  });

  it.effect("emits skipped unresolved commands as plan steps without warning logs", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const sourcesLayer = Layer.succeed(SourceHostProviders, {
      find: (_source, request) =>
        Effect.succeed(request.names.includes("my-cmd") ? [makeRegistryRef("my-cmd")] : []),
      fetch: () => Effect.die("unused"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive, sourcesLayer);
    const provide = makeEffectProvide(fullLayer);
    const { logs, rendererState } = ctx;

    initWorkspace(
      path.join(tempDir, ".axm"),
      {
        "my-cmd": path.join(tempDir, "my-cmd"),
        "missing-cmd": path.join(tempDir, "missing-cmd"),
      },
      {},
    );

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs({ preview: true }));

        expect(logs.warn).toEqual([]);
        const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Update commands",
          totalSteps: 2,
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "my-cmd",
              status: "ready",
            },
            {
              label: "Skip missing-cmd",
              status: "ready",
            },
          ],
        });
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Disabled commands skipped
  // ---------------------------------------------------------------------------

  it.effect("skips disabled commands during update", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
      {},
    );

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs());

        expect(logs.info).toEqual([]);
        expect(logs.success).toContain("No commands installed.");
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update commands",
          message: "No commands installed.",
        });
      }),
    );
  });

  it.effect("reports disabled-only command updates as JSON no-op without logs", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    initWorkspace(
      path.join(tempDir, ".axm"),
      { "my-cmd": { source: "@acme/commands/my-cmd", enabled: false } },
      {},
    );

    return provide(
      Effect.gen(function* () {
        yield* handleUpdateCommand(defaultArgs());

        expect(logs.info).toEqual([]);
        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Update commands",
          message: "No commands installed.",
        });
      }),
    );
  });
});
