import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { HookManagerLive } from "@agentxm/extension-management/unstable/hooks";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleDisableHook } from "./disable.js";
import { handleEnableHook } from "./enable.js";
import { handleHooksNew } from "./new.js";

const hookEntry = (enabled: boolean) => ({
  source: "@acme/hooks/workspace-baseline",
  enabled,
});

describe("hooks enable/disable no-op output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-enable-disable-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(HookManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  it.effect("reports an already-enabled hook package in human output", () => {
    const { provide, logs } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: { "workspace-baseline": hookEntry(true) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableHook({
          name: "workspace-baseline",
          yes: false,
          preview: false,
        });

        expect(logs.success).toEqual(['hooks package "workspace-baseline" is already enabled']);
      }),
    );
  });

  it.effect("reports an already-enabled hook package as JSON no-op without success log", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: { "workspace-baseline": hookEntry(true) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableHook({
          name: "workspace-baseline",
          yes: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable hooks",
          message: 'hooks package "workspace-baseline" is already enabled',
        });
      }),
    );
  });

  it.effect("reports an already-disabled hook package as JSON no-op without success log", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: { "workspace-baseline": hookEntry(false) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableHook({
          name: "workspace-baseline",
          yes: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable hooks",
          message: 'hooks package "workspace-baseline" is already disabled',
        });
      }),
    );
  });

  it.effect("reports an unconfigured hook package as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: {},
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableHook({
          name: "missing",
          yes: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable hooks",
          message: 'hooks package "missing" is not configured',
        });
      }),
    );
  });

  it.effect("reports an unconfigured hook package on enable as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: {},
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableHook({
          name: "missing",
          yes: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable hooks",
          message: 'hooks package "missing" is not configured',
        });
      }),
    );
  });

  it.effect("re-enables a workspace-sourced hook package from its canonical source", () => {
    const { provide, logs } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleHooksNew({
          name: decodeExtensionNameSync("workspace-baseline"),
          owner: Option.some("@acme"),
          runtime: "bash",
          event: "tool.pre",
          matcher: Option.some("Bash"),
          yes: true,
          preview: false,
        });
        yield* handleDisableHook({
          name: "workspace-baseline",
          yes: true,
          preview: false,
        });
        yield* handleEnableHook({
          name: "workspace-baseline",
          yes: true,
          preview: false,
        });

        expect(logs.success).toContain("Enabled 1 hook");
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"));
        expect(settings.hooks["workspace-baseline"]).toBe("workspace");
        expect(fs.existsSync(path.join(tempDir, "hooks", "workspace-baseline"))).toBe(true);
      }),
    );
  });
});
