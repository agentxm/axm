import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { FilesManagerLive } from "@agentxm/client-core/unstable/files";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleDisableFiles } from "./disable.js";
import { handleEnableFiles } from "./enable.js";
import { handleFilesNew } from "./new.js";

const filesEntry = (enabled: boolean) => ({
  source: "@acme/files/workspace-baseline",
  enabled,
});

describe("files enable/disable no-op output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-enable-disable-test-"));
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
    const fullLayer = Layer.provideMerge(FilesManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  it.effect("reports an already-enabled files package in human output", () => {
    const { provide, logs } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: { "workspace-baseline": filesEntry(true) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableFiles({
          name: "workspace-baseline",
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual(['files package "workspace-baseline" is already enabled']);
      }),
    );
  });

  it.effect("reports an already-enabled files package as JSON no-op without success log", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: { "workspace-baseline": filesEntry(true) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableFiles({
          name: "workspace-baseline",
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable files",
          message: 'files package "workspace-baseline" is already enabled',
        });
      }),
    );
  });

  it.effect("reports an already-disabled files package as JSON no-op without success log", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: { "workspace-baseline": filesEntry(false) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableFiles({
          name: "workspace-baseline",
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable files",
          message: 'files package "workspace-baseline" is already disabled',
        });
      }),
    );
  });

  it.effect("emits a settings artifact when disabling a files package", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: { "workspace-baseline": filesEntry(true) },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableFiles({
          name: "workspace-baseline",
          yes: false,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable files",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "workspace-baseline",
              status: "applied",
              artifact: {
                path: ".axm/settings.json",
                scope: "project",
                change: "updated",
              },
            },
          ],
        });
      }),
    );
  });

  it.effect("re-enables an authored files package from the managed local source", () => {
    const { provide, logs } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleFilesNew({
          name: "workspace-baseline",
          owner: Option.some("@acme"),
          yes: true,
          force: false,
          preview: false,
        });
        yield* handleDisableFiles({
          name: "workspace-baseline",
          yes: true,
          force: false,
          preview: false,
        });
        yield* handleEnableFiles({
          name: "workspace-baseline",
          yes: true,
          force: false,
          preview: false,
        });

        expect(logs.success).toContain("Enabled files package workspace-baseline");
        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.files["workspace-baseline"]).toEqual({
          source: "@acme/files/workspace-baseline",
          authored: true,
        });
      }),
    );
  });

  it.effect("reports an unconfigured files package as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: {},
    });

    return provide(
      Effect.gen(function* () {
        yield* handleEnableFiles({
          name: "missing",
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable files",
          message: 'files package "missing" is not configured',
        });
      }),
    );
  });

  it.effect("reports an unconfigured files package on disable as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      files: {},
    });

    return provide(
      Effect.gen(function* () {
        yield* handleDisableFiles({
          name: "missing",
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable files",
          message: 'files package "missing" is not configured',
        });
      }),
    );
  });
});
