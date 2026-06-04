/**
 * Unit tests for the new-hook operation.
 *
 * Tests directory creation, manifest writing, the starter entrypoint, the
 * binding/matcher derivation, and the existing-directory error.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { normalizeHandle } from "../../extensions/index.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import type { NewHookOperation } from "./new-hook.js";
import { newHook } from "./new-hook.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string, opts: Partial<NewHookOperation["args"]> = {}): NewHookOperation => ({
  name: "new-hook",
  args: {
    name,
    owner: normalizeHandle(opts.owner ?? "@acme"),
    runtime: opts.runtime ?? "bash",
    event: opts.event ?? "PreToolUse",
    matcher: opts.matcher ?? "Write|Edit",
    force: opts.force ?? false,
  },
});

const hookDir = (tempDir: string, name: string, owner = "@acme") =>
  path.join(tempDir, ".axm", "extensions", owner, "hooks", name);

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("new-hook operation", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-hook-op-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const testLayer = () =>
    Layer.mergeAll(
      NodeServices.layer,
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(path.join(tempDir, ".axm"))),
    );

  it.effect("creates directory with manifest and bash entrypoint", () =>
    Effect.gen(function* () {
      const result = yield* newHook(makeOp("tool-audit"));

      expect(result.result).toBe("success");
      expect(result.message).toContain("@acme/hooks/tool-audit");

      const manifestPath = path.join(hookDir(tempDir, "tool-audit"), "hook.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@acme");
      expect(manifest.type).toBe("hook");
      expect(manifest.name).toBe("tool-audit");
      expect(manifest.version).toBe("0.1.0");
      expect(manifest.runtime).toBe("bash");
      expect(manifest.entrypoint).toBe("src/hook.sh");
      expect(manifest.bindings).toEqual([{ event: "PreToolUse", matcher: "Write|Edit" }]);
      expect(manifest.$schema).toBe("https://axm.sh/schemas/hook.schema.json");

      const entrypointPath = path.join(hookDir(tempDir, "tool-audit"), "src", "hook.sh");
      expect(fs.existsSync(entrypointPath)).toBe(true);
      const entrypoint = fs.readFileSync(entrypointPath, "utf-8");
      expect(entrypoint).toContain("#!/usr/bin/env bash");
      expect(entrypoint).toContain("@acme/hooks/tool-audit");
    }).pipe(Effect.provide(testLayer())),
  );

  it.effect("drops the matcher for non-tool events", () =>
    Effect.gen(function* () {
      yield* newHook(makeOp("on-start", { event: "SessionStart", matcher: "Write|Edit" }));

      const manifestPath = path.join(hookDir(tempDir, "on-start"), "hook.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.bindings).toEqual([{ event: "SessionStart" }]);
    }).pipe(Effect.provide(testLayer())),
  );

  it.effect("writes the python entrypoint for the python runtime", () =>
    Effect.gen(function* () {
      yield* newHook(makeOp("py-hook", { runtime: "python" }));

      const manifestPath = path.join(hookDir(tempDir, "py-hook"), "hook.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.runtime).toBe("python");
      expect(manifest.entrypoint).toBe("src/hook.py");

      const entrypointPath = path.join(hookDir(tempDir, "py-hook"), "src", "hook.py");
      expect(fs.existsSync(entrypointPath)).toBe(true);
      expect(fs.readFileSync(entrypointPath, "utf-8")).toContain("#!/usr/bin/env python3");
    }).pipe(Effect.provide(testLayer())),
  );

  it.effect("fails when directory already exists", () =>
    Effect.gen(function* () {
      fs.mkdirSync(hookDir(tempDir, "existing"), { recursive: true });

      const result = yield* newHook(makeOp("existing")).pipe(
        Effect.catchTag("AppError", (e) => Effect.succeed({ result: "error", code: e.code })),
      );

      expect(result.result).toBe("error");
      if ("code" in result) {
        expect(result.code).toBe("conflict");
      }
    }).pipe(Effect.provide(testLayer())),
  );

  it.effect("overwrites an existing directory when force is set", () =>
    Effect.gen(function* () {
      fs.mkdirSync(hookDir(tempDir, "existing"), { recursive: true });

      const result = yield* newHook(makeOp("existing", { force: true }));

      expect(result.result).toBe("success");
      const manifestPath = path.join(hookDir(tempDir, "existing"), "hook.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
    }).pipe(Effect.provide(testLayer())),
  );
});
