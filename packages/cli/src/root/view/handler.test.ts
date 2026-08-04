import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import {
  expectNoPlanEnvelope,
  getAppError,
  makeCliTestContext,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleView } from "./handler.js";

const initWorkspace = (root: string, registryRoot: string) => {
  fs.mkdirSync(path.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".axm", "settings.json"),
    JSON.stringify({
      owner: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
    }),
  );
  fs.writeFileSync(
    path.join(root, ".axm", "axm-lock.yaml"),
    "lockfileVersion: 3\nskills: {}\ncommands: {}\n",
  );
};

const writeIndex = (registryRoot: string) => {
  const dir = path.join(registryRoot, "extensions", "@test", "skills", "code-review");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify({
      owner: "@test",
      type: "skill",
      name: "code-review",
      publisherBindingId: "hbnd_test",
      description: "Review code",
      versions: [
        {
          version: "1.2.3",
          published: "2026-01-01T00:00:00.000Z",
          integrity: "sha512-test",
        },
        {
          version: "1.2.2",
          published: "2025-12-01T00:00:00.000Z",
          integrity: "sha512-test-2",
        },
      ],
    }),
  );
};

const writeRuleIndex = (registryRoot: string) => {
  const dir = path.join(registryRoot, "extensions", "@test", "rules", "house-style");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify({
      owner: "@test",
      type: "rule",
      name: "house-style",
      publisherBindingId: "hbnd_test",
      description: "House style rules",
      versions: [
        {
          version: "1.0.0",
          published: "2026-01-01T00:00:00.000Z",
          integrity: "sha512-rule",
        },
      ],
    }),
  );
};

describe("view handler", () => {
  let tempDir: string;
  let registryRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-handler-test-"));
    registryRoot = path.join(tempDir, "registry");
    process.chdir(tempDir);
    initWorkspace(tempDir, registryRoot);
    writeIndex(registryRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("prints latest version in field mode", () => {
    const { provide, logs, rendererState } = makeWorkspaceHandlerTestContext();
    initWorkspace(tempDir, registryRoot);
    writeIndex(registryRoot);

    return provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@test/skills/code-review",
          field: Option.some("version"),
          registry: Option.some("local"),
        });

        expect(logs.message).toContain("1.2.3\n");
        expect(rendererState.spinnerMessages).toEqual([
          "Loading @test/skills/code-review from local",
          "Loaded @test/skills/code-review from local",
        ]);
      }),
    );
  });

  it.effect("emits structured JSON document in machine mode", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    initWorkspace(tempDir, registryRoot);
    writeIndex(registryRoot);

    return provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@test/skills/code-review",
          field: Option.none(),
          registry: Option.some("local"),
        });

        expect(rendererState.results[0]?.data).toEqual(
          expect.objectContaining({
            handle: "@test/skills/code-review",
            latest: {
              version: "1.2.3",
              published: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
            },
          }),
        );
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("suggests the per-type install command for a type that registers one", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    initWorkspace(tempDir, registryRoot);
    writeIndex(registryRoot);

    return provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@test/skills/code-review",
          field: Option.none(),
          registry: Option.some("local"),
        });

        expect(rendererState.results[0]?.data).toEqual(
          expect.objectContaining({
            install: "axm skills install @test/skills/code-review",
          }),
        );
      }),
    );
  });

  // `axm rules` only toggles instruction-file management, so rule extensions
  // must be pointed at the root installer rather than `axm rules install`.
  it.effect("suggests the per-type install command for rule extensions", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    initWorkspace(tempDir, registryRoot);
    writeRuleIndex(registryRoot);

    return provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@test/rules/house-style",
          field: Option.none(),
          registry: Option.some("local"),
        });

        expect(rendererState.results[0]?.data).toEqual(
          expect.objectContaining({
            install: "axm rules install @test/rules/house-style",
          }),
        );
      }),
    );
  });

  it.effect("uses the default registry URL without requiring workspace settings", () => {
    fs.rmSync(path.join(tempDir, ".axm"), { recursive: true, force: true });
    const ctx = makeCliTestContext({ machine: true });
    const layer = Layer.mergeAll(
      ctx.baseLayer,
      Layer.succeed(RegistryUrl, `file://${registryRoot}`),
    );
    const provide = makeEffectProvide(layer);

    return provide(
      Effect.gen(function* () {
        yield* handleView({
          handle: "@test/skills/code-review",
          field: Option.none(),
          registry: Option.none(),
        });

        expect(ctx.rendererState.results[0]?.data).toEqual(
          expect.objectContaining({
            handle: "@test/skills/code-review",
            latest: {
              version: "1.2.3",
              published: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
            },
          }),
        );
      }),
    );
  });

  it.effect("fails with supported fields for an unknown field", () => {
    const { provide } = makeWorkspaceHandlerTestContext();
    initWorkspace(tempDir, registryRoot);
    writeIndex(registryRoot);

    return provide(
      Effect.gen(function* () {
        const result = yield* handleView({
          handle: "@test/skills/code-review",
          field: Option.some("bad-field"),
          registry: Option.some("local"),
        }).pipe(Effect.flip);
        expect(getAppError(result).detail).toContain("Unknown view field");
      }),
    );
  });

  for (const testCase of [
    { label: "default output", options: {} },
    { label: "JSON output", options: { machine: true } },
    { label: "verbose output", options: { flags: { verbose: true } } },
  ]) {
    it.effect(
      `does not report a successful load for a missing extension in ${testCase.label}`,
      () => {
        const { provide, rendererState } = makeWorkspaceHandlerTestContext(testCase.options);

        return provide(
          Effect.gen(function* () {
            const error = yield* handleView({
              handle: "@test/skills/missing",
              field: Option.none(),
              registry: Option.some("local"),
            }).pipe(Effect.flip);

            expect(getAppError(error).code).toBe("not_found");
            expect(rendererState.spinnerMessages).toContain(
              "Loading @test/skills/missing from local",
            );
            expect(rendererState.spinnerMessages).not.toContain(
              "Loaded @test/skills/missing from local",
            );
          }),
        );
      },
    );
  }
});
