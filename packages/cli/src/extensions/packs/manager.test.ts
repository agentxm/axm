/**
 * Tests for PackManager contract compliance.
 *
 * Verifies: extensionType, settings/lockfile delegation,
 * builtin refs skip settings/lockfile.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { vi } from "vitest";
import { PackManager, PackManagerLive } from "./manager.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { SourceHostProviders, type SourceHostProvidersService } from "../../sources/index.js";
import type { BuiltinPackRef, RegistryPackRef, RegistrySource } from "../../sources/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registrySource: RegistrySource = {
  type: "registry",
  location: new URL("https://registry.example.com"),
  namespace: Option.none(),
};

const makeRegistryPackRef = (name: string): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  source: registrySource,
  pack: { name, skills: {}, commands: {}, mcpServers: {} },
  namespace: "@test",
  name,
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeBuiltinPackRef = (name: string): BuiltinPackRef => ({
  type: "pack",
  refType: "builtin",
  source: { type: "builtin" },
  pack: { name, skills: {}, commands: {}, mcpServers: {} },
  namespace: "@axm",
});

const makeWsMock = (overrides?: {
  setPack?: ReturnType<typeof vi.fn>;
  removePackSettings?: ReturnType<typeof vi.fn>;
  removePackLock?: ReturnType<typeof vi.fn>;
}) =>
  makeBaseWorkspaceMock("/tmp/axm", {
    setPack: overrides?.setPack ?? vi.fn(() => Effect.void),
    removePackSettings: overrides?.removePackSettings ?? vi.fn(() => Effect.void),
    removePackLock: overrides?.removePackLock ?? vi.fn(() => Effect.void),
  });

const makeSourcesMock = (): SourceHostProvidersService => ({
  find: () => Effect.succeed([]),
  fetch: () => Effect.succeed({ directory: "/tmp/fetched" }),
  cloneUrl: () => Option.none(),
  origin: () => "mock",
});

const buildTestLayer = (wsMock: WorkspaceContextService) =>
  PackManagerLive.pipe(
    Layer.provide(Layer.succeed(Workspace, wsMock)),
    Layer.provide(Layer.succeed(SourceHostProviders, makeSourcesMock())),
    Layer.provide(NodeServices.layer),
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PackManager", () => {
  it.effect("has extensionType 'pack'", () =>
    Effect.gen(function* () {
      const manager = yield* PackManager;
      expect(manager.extensionType).toBe("pack");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock()))),
  );

  it.effect("upsertSettingsEntry skips for builtin refs", () => {
    const setPackFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* PackManager;
      yield* manager.upsertSettingsEntry({
        ref: makeBuiltinPackRef("core"),
        versionConstraint: Option.none(),
      });
      expect(setPackFn).not.toHaveBeenCalled();
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setPack: setPackFn }))));
  });

  it.effect("upsertSettingsEntry delegates to ws.setPack for registry refs", () => {
    const setPackFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* PackManager;
      yield* manager.upsertSettingsEntry({
        ref: makeRegistryPackRef("my-pack"),
        versionConstraint: Option.some("^1.0.0"),
      });
      expect(setPackFn).toHaveBeenCalledTimes(1);
      const args = (setPackFn.mock.calls as unknown[][])[0]![0] as {
        name: string;
        resolvedVersion: string;
        versionConstraint: unknown;
      };
      expect(args.name).toBe("my-pack");
      expect(args.resolvedVersion).toBe("1.0.0");
      expect(args.versionConstraint).toEqual(Option.some("^1.0.0"));
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setPack: setPackFn }))));
  });

  it.effect("removeSettingsEntry delegates to ws.removePackSettings", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* PackManager;
      yield* manager.removeSettingsEntry({
        target: { type: "pack", name: "my-pack", namespace: "@test" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-pack");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removePackSettings: removeFn }))));
  });

  it.effect("removeLockfileEntry delegates to ws.removePackLock", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* PackManager;
      yield* manager.removeLockfileEntry({
        target: { type: "pack", name: "my-pack", namespace: "@test" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-pack");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removePackLock: removeFn }))));
  });

  it.effect("upsertLockfileEntry skips for builtin refs", () => {
    const setPackFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* PackManager;
      yield* manager.upsertLockfileEntry({ ref: makeBuiltinPackRef("core") });
      expect(setPackFn).not.toHaveBeenCalled();
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setPack: setPackFn }))));
  });
});
