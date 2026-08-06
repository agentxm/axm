import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { FilesManagerLive } from "@agentxm/client-core/unstable/files";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
  property,
} from "../../test-helpers.js";
import { handleFilesNew } from "./new.js";
import { afterEach, beforeEach } from "vitest";

const initWorkspace = (axmDir: string, opts: { owner?: string; agents?: string[] } = {}) => {
  writeWorkspaceFiles(axmDir, { agents: opts.agents, owner: opts.owner });
};

describe("files-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(FilesManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  it.effect("creates files package, registers it, materializes target, and emits edit hint", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleFilesNew({
          name: "workspace-baseline",
          owner: Option.none(),
          yes: false,
          preview: false,
        });

        const packageDir = path.join(
          tempDir,
          ".axm",
          "extensions",
          "@acme",
          "files",
          "workspace-baseline",
        );
        const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "files.json"), "utf-8"));
        expect(manifest).toMatchObject({
          owner: "@acme",
          type: "files",
          name: "workspace-baseline",
          version: "0.1.0",
        });
        expect(fs.existsSync(path.join(packageDir, "src", "README.md"))).toBe(true);

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.files?.["workspace-baseline"]).toBe(
          "workspace:@acme/files/workspace-baseline",
        );

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
        );
        expect(lockfile.files["workspace-baseline"]).toMatchObject({
          type: "workspace",
          owner: "@acme",
          extensionType: "files",
          name: "workspace-baseline",
          version: "0.1.0",
          sourceHash: expect.any(String),
        });
        expect(fs.readFileSync(path.join(tempDir, "files", "workspace-baseline.md"), "utf-8")).toBe(
          "# workspace-baseline\n",
        );
        expect(logs.success).toEqual([
          "Created files package @acme/files/workspace-baseline with 1 target",
        ]);
        expect(rendererState.summaries).toEqual(["-> 1 target   0.1.0 | 1 file"]);
        expect(rendererState.suggestions).toEqual([
          {
            description:
              "Edit `.axm/extensions/@acme/files/workspace-baseline/src/README.md` to update files content",
          },
        ]);
        const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
        const result = expectAppliedPlanResult(renderedResult.data, {
          planName: "New files",
        });
        const steps = planResultSteps(result);
        const firstStep = expectRecord(expectDefined(steps[0], "Expected first step"));
        const artifact = expectRecord(property(firstStep, "artifact"));
        expect(property(artifact, "path")).toBe(".axm/extensions/@acme/files/workspace-baseline");
        expect(property(artifact, "version")).toBe("0.1.0");
        expect(property(artifact, "fileCount")).toBe(1);
        const targets = property(artifact, "targets");
        if (!Array.isArray(targets)) {
          throw new Error("Expected artifact.targets array");
        }
        expect(targets.map((target) => property(expectRecord(target), "path"))).toEqual([
          "files/workspace-baseline.md",
        ]);
      }),
    );
  });

  it.effect("rejects rerun before reporting success", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleFilesNew({
          name: "workspace-baseline",
          owner: Option.none(),
          yes: false,
          preview: false,
        });

        const error = yield* Effect.flip(
          handleFilesNew({
            name: "workspace-baseline",
            owner: Option.none(),
            yes: false,
            preview: false,
          }),
        );

        expect(getAppError(error).code).toBe("conflict");
      }),
    );
  });
});
