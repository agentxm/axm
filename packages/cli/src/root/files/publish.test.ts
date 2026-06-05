import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleFilesPublish } from "./publish.js";

const initWorkspace = (axmDir: string, registryRoot: string) => {
  writeWorkspaceFiles(axmDir, {
    owner: "@test",
    sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
  });
};

const createManagedFilesPackage = (
  root: string,
  owner: string,
  name: string,
  version = "1.0.0",
) => {
  const packageDir = path.join(root, ".axm", "extensions", owner, "files", name);
  fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "files.json"),
    JSON.stringify(
      {
        owner,
        type: "files",
        name,
        version,
        contents: [
          {
            source: { kind: "static", path: "README.md" },
            target: `files/${name}.md`,
            mode: "sync-once",
          },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(packageDir, "src", "README.md"), `# ${name}\n`);
};

const defaultArgs = (input: string) => ({
  input,
  registry: Option.some("local"),
  yes: false,
  force: false,
  preview: false,
});

describe("files publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-publish-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { machine?: boolean; quiet?: boolean }) => {
    const ctx = makeWorkspaceHandlerTestContext({
      machine: opts?.machine,
      ...(opts?.quiet === undefined ? {} : { flags: { quiet: opts.quiet } }),
    });
    return {
      ...ctx,
      provide: makeEffectProvide(ctx.fullLayer),
    };
  };

  it.effect("emits publish plan JSON with artifact in machine mode", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    const registryRoot = path.join(tempDir, "registry");
    initWorkspace(path.join(tempDir, ".axm"), registryRoot);
    createManagedFilesPackage(tempDir, "@test", "machine-files");

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPublish(defaultArgs("@test/files/machine-files"));

        expect(logs.success).toEqual([]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Publish files",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Publish @test/files/machine-files",
              status: "applied",
              message: "Published @test/files/machine-files@1.0.0",
              artifact: {
                path: "@test/files/machine-files@1.0.0",
                scope: "project",
                version: "1.0.0",
                change: "created",
              },
            },
          ],
        });
        expect(rendererState.suggestions).toEqual([
          {
            description: "View published metadata",
            cmd: "axm view @test/files/machine-files",
          },
        ]);
      }),
    );
  });

  it.effect("suppresses publish suggestions in quiet mode", () => {
    const { provide, logs, rendererState } = makeLayers({ quiet: true });
    const registryRoot = path.join(tempDir, "registry");
    initWorkspace(path.join(tempDir, ".axm"), registryRoot);
    createManagedFilesPackage(tempDir, "@test", "quiet-files");

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPublish(defaultArgs("@test/files/quiet-files"));

        expect(logs.success).toEqual(["Published @test/files/quiet-files@1.0.0"]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  });

  it.effect("rejects publishing an already-published version before upload", () => {
    const { provide } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    initWorkspace(path.join(tempDir, ".axm"), registryRoot);
    createManagedFilesPackage(tempDir, "@test", "duplicate-files");

    return provide(
      Effect.gen(function* () {
        yield* handleFilesPublish(defaultArgs("@test/files/duplicate-files"));

        const error = yield* Effect.flip(
          handleFilesPublish(defaultArgs("@test/files/duplicate-files")),
        );

        const appError = getAppError(error);
        expect(appError.code).toBe("conflict");
        expect(appError.suggestions).toEqual([
          {
            description:
              "Bump the version in `.axm/extensions/@test/files/duplicate-files/files.json`.",
          },
        ]);
      }),
    );
  });
});
