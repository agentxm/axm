/**
 * Unit tests for HookManager service.
 *
 * Tests cover Claude Code hooks config materialization behavior.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { HookManager, HookManagerLive } from "./manager.js";
import type { LocalHookRef } from "./refs.js";

const writeHookPackage = (packageRoot: string, name: string) => {
  mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  writeFileSync(
    nodePath.join(packageRoot, "hook.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "hook",
        name,
        version: "1.0.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ event: "PreToolUse", matcher: "Write|Edit" }],
      },
      null,
      2,
    ),
  );
  writeFileSync(nodePath.join(packageRoot, "src", "hook.sh"), "#!/usr/bin/env bash\n");
};

const makeLocalHookRef = (name: string, packageRoot: string): LocalHookRef => ({
  type: "hook",
  refType: "local",
  source: { type: "local", path: packageRoot },
  location: pathToFileURL(packageRoot).href,
  hook: { name: decodeExtensionNameSync(name) },
});

const makeSourceHostProviders = () =>
  Layer.succeed(SourceHostProviders, {
    find: () => Effect.succeed([]),
    fetch: () =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: "not used",
        }),
      ),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

const makeHookManagerLayer = (workspaceRoot: string) =>
  HookManagerLive.pipe(
    Layer.provide(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock(nodePath.join(workspaceRoot, ".axm"), {
          getConfiguredHookEntries: () => Effect.succeed({}),
        }),
      ),
    ),
    Layer.provide(makeSourceHostProviders()),
    Layer.provide(NodeServices.layer),
  );

describe("HookManager", () => {
  it.effect("updates Claude Code settings without a workspace backup", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-hook-manager-"));
      try {
        const settingsDir = nodePath.join(workspaceRoot, ".claude");
        mkdirSync(settingsDir, { recursive: true });
        const settingsPath = nodePath.join(settingsDir, "settings.json");
        writeFileSync(
          settingsPath,
          '{\n  "hooks": {\n    "Stop": [{ "hooks": [{ "type": "command", "command": "echo keep" }] }]\n  }\n}\n',
        );

        const packageRoot = nodePath.join(workspaceRoot, "source-hook");
        writeHookPackage(packageRoot, "identity-check");

        yield* Effect.gen(function* () {
          const manager = yield* HookManager;
          yield* manager.materializeInstall({
            ref: makeLocalHookRef("identity-check", packageRoot),
          });
        }).pipe(Effect.provide(makeHookManagerLayer(workspaceRoot)));

        const raw = readFileSync(settingsPath, "utf8");
        expect(raw).toContain("echo keep");
        expect(raw).toContain('"PreToolUse"');
        expect(raw).toContain('"matcher": "Write|Edit"');
        expect(raw).toContain(".axm/extensions/external/hooks/identity-check/src/hook.sh");
        expect(existsSync(`${settingsPath}.bak`)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
});
