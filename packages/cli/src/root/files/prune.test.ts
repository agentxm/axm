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
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleFilesPrune } from "./prune.js";

const lockEntry = {
  type: "local",
  path: "fixtures/files",
  installedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("files prune output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-prune-test-"));
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

  it.effect("reports a clean files lockfile in human output", () => {
    const { provide, logs } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPrune();

        expect(logs.success).toEqual(["No files lock entries pruned."]);
      }),
    );
  });

  it.effect("reports a clean files lockfile as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPrune();

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Prune files lock entries",
          message: "No files lock entries pruned.",
        });
      }),
    );
  });

  it.effect("emits an applied plan result for pruned files lock entries", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      lockfileFiles: {
        "workspace-baseline": lockEntry,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPrune();

        const lockfile = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
        expect(lockfile.files).toEqual({});
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Prune files lock entries",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "workspace-baseline",
              status: "applied",
              artifact: {
                path: ".axm/axm-lock.yaml",
                scope: "project",
                change: "removed",
              },
            },
          ],
        });
      }),
    );
  });
});
