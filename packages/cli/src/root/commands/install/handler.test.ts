/**
 * Unit tests for the commands install handler.
 *
 * Tests preview mode display of target agents and lossy-rendering warnings.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { CommandManagerLive } from "@axm.sh/core/unstable/commands";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { handleInstallCommand } from "./handler.js";
import { InstallCommandCommandWorkflowActionsLive } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (axmDir: string, agents: string[] = ["claude-code"]) => {
  writeWorkspaceFiles(axmDir, { agents });
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands install.handler preview", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const cmdMgrLayer = Layer.provide(CommandManagerLive, ctx.fullLayer);
    const sourcesLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const baseWithDeps = Layer.mergeAll(ctx.fullLayer, cmdMgrLayer, sourcesLayer);
    const actionsLayer = Layer.provide(InstallCommandCommandWorkflowActionsLive, baseWithDeps);
    const fullLayer = Layer.mergeAll(baseWithDeps, CodingAgentRepositoryLive, actionsLayer);
    return { ...ctx, fullLayer, provide: makeEffectProvide(fullLayer) };
  };

  it.effect("displays target agents in preview mode", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), ["claude-code", "cursor"]);

    return provide(
      Effect.gen(function* () {
        // The workflow will fail to resolve source but preview info should appear first
        yield* handleInstallCommand({
          source: "my-cmd",
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.ignore);

        expect(logs.info.some((m) => m.includes("Target agents"))).toBe(true);
        expect(logs.info.some((m) => m.includes("claude-code"))).toBe(true);
        expect(logs.info.some((m) => m.includes("cursor"))).toBe(true);
      }),
    );
  });

  it.effect("shows no agents message when none are configured", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), []);

    return provide(
      Effect.gen(function* () {
        yield* handleInstallCommand({
          source: "my-cmd",
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.ignore);

        expect(logs.info.some((m) => m.includes("No agents configured"))).toBe(true);
      }),
    );
  });

  it.effect("does not display preview info when preview is false", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), ["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleInstallCommand({
          source: "my-cmd",
          yes: false,
          force: false,
          preview: false,
        }).pipe(Effect.ignore);

        expect(logs.info.some((m) => m.includes("Target agents"))).toBe(false);
      }),
    );
  });
});
