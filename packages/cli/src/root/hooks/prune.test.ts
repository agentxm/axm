import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleHookPrune } from "./prune.js";

const lockEntry = {
  type: "local",
  path: "fixtures/hooks",
  installedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("hooks prune output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-prune-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    return {
      ...ctx,
      provide: ctx.provide,
    };
  };

  it.effect("reports a clean hooks lockfile in human output", () => {
    const { provide, logs } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleHookPrune({ yes: false });

        expect(logs.success).toEqual(["No hooks lock entries pruned."]);
      }),
    );
  });

  it.effect("reports a clean hooks lockfile as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleHookPrune({ yes: false });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Prune hooks lock entries",
          message: "No hooks lock entries pruned.",
        });
      }),
    );
  });

  it.effect("previews stale hooks lock entries without removing them by default", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      lockfileHooks: {
        "workspace-baseline": lockEntry,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleHookPrune({ yes: false });

        const lockfile = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(lockfile.hooks).toEqual({ "workspace-baseline": lockEntry });
        expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Prune hooks lock entries",
          totalSteps: 1,
        });
      }),
    );
  });

  it.effect("emits an applied plan result for pruned hooks lock entries with --yes", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      lockfileHooks: {
        "workspace-baseline": lockEntry,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleHookPrune({ yes: true });

        const lockfile = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(lockfile.hooks).toEqual({});
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Prune hooks lock entries",
        });
      }),
    );
  });
});
