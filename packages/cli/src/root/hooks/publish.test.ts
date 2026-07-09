import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectPublishResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handlePublishHook } from "./publish.js";

const initWorkspace = (axmDir: string, registryRoot: string) => {
  writeWorkspaceFiles(axmDir, {
    owner: "@test",
    sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
  });
};

const createManagedHookPackage = (root: string, owner: string, name: string, version = "1.0.0") => {
  const packageDir = path.join(root, ".axm", "extensions", owner, "hooks", name);
  fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "hook.json"),
    JSON.stringify(
      {
        owner,
        type: "hook",
        name,
        version,
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre", matcherRaw: "Write|Edit" }],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(packageDir, "src", "hook.sh"), "#!/usr/bin/env bash\nexit 0\n");
};

const defaultArgs = (name: string) => ({
  name,
  registry: "local",
  yes: false,
  preview: false,
});

describe("hooks publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-publish-handler-test-"));
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
    createManagedHookPackage(tempDir, "@test", "machine-hook");

    return provide(
      Effect.gen(function* () {
        yield* handlePublishHook(defaultArgs("@test/hooks/machine-hook"));

        expect(logs.success).toEqual([]);
        const result = expectPublishResult(rendererState.results[0]?.data, {
          mode: "apply",
          count: 1,
        });
        expect(result).toMatchObject({
          results: [
            {
              owner: "@test",
              type: "hook",
              name: "machine-hook",
              version: "1.0.0",
              action: "publish",
              status: "success",
              message: "Published @test/hooks/machine-hook@1.0.0",
            },
          ],
        });
        expect(rendererState.suggestions).toEqual([
          {
            description: "View published metadata",
            cmd: "axm view @test/hooks/machine-hook",
          },
        ]);
      }),
    );
  });

  it.effect("suppresses publish suggestions in quiet mode", () => {
    const { provide, logs, rendererState } = makeLayers({ quiet: true });
    const registryRoot = path.join(tempDir, "registry");
    initWorkspace(path.join(tempDir, ".axm"), registryRoot);
    createManagedHookPackage(tempDir, "@test", "quiet-hook");

    return provide(
      Effect.gen(function* () {
        yield* handlePublishHook(defaultArgs("@test/hooks/quiet-hook"));

        expect(logs.success).toEqual(["Published @test/hooks/quiet-hook@1.0.0"]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  });

  it.effect("rejects publishing an already-published version before upload", () => {
    const { provide } = makeLayers();
    const registryRoot = path.join(tempDir, "registry");
    initWorkspace(path.join(tempDir, ".axm"), registryRoot);
    createManagedHookPackage(tempDir, "@test", "duplicate-hook");

    return provide(
      Effect.gen(function* () {
        yield* handlePublishHook(defaultArgs("@test/hooks/duplicate-hook"));

        const error = yield* Effect.flip(
          handlePublishHook(defaultArgs("@test/hooks/duplicate-hook")),
        );

        const appError = getAppError(error);
        expect(appError.code).toBe("conflict");
        expect(appError.suggestions).toEqual([
          {
            description: "Bump the manifest version.",
            cmd: "axm version @test/hooks/duplicate-hook patch",
          },
        ]);
      }),
    );
  });
});
