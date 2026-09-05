/** Internal artifact assembly and invalid branded-input defense for hook creation. */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";
import { HookManagerLive } from "@agentxm/extension-lifecycle/live";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-helpers.js";
import { handleHooksNew, type HooksNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (axmDir: string, opts: { owner?: string; agents?: string[] } = {}) => {
  writeWorkspaceFiles(axmDir, { agents: opts.agents, owner: opts.owner });
};

const defaultArgs = (
  name: string,
  overrides: Partial<HooksNewHandlerArgs> = {},
): HooksNewHandlerArgs => ({
  name: extensionName(name),
  owner: Option.none(),
  runtime: "bash",
  event: "tool.pre",
  matcher: Option.none(),
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("hooks-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { readonly machine?: boolean }) => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: opts?.machine });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(HookManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("emits scaffold plan JSON with artifact in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("machine-hook"));

          expect(logs.success).toEqual([]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New hook",
          });
          const units = planResultUnits(result);
          const firstUnit = expectRecord(expectDefined(units[0], "Expected first unit"));
          expect(firstUnit).toMatchObject({
            id: "hook:machine-hook",
            label: "@acme/hooks/machine-hook",
            state: "committed",
            message: "Created hook @acme/hooks/machine-hook",
            artifact: {
              path: "hooks/machine-hook",
              scope: "project",
              version: "0.1.0",
              change: "created",
              fileCount: 2,
              targets: [
                {
                  path: ".claude/settings.json",
                  change: "created",
                },
                {
                  path: "AGENTS.md",
                  change: "created",
                },
              ],
            },
          });
          expect(rendererState.suggestions).toEqual([
            {
              description: "Edit `hooks/machine-hook/src/hook.sh` to implement the hook",
            },
          ]);
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects an uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleHooksNew({
            ...defaultArgs("valid"),
            name: "BadHook" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });
  });
});
