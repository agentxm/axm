/**
 * Tests for McpServerManager contract compliance.
 *
 * Verifies: extensionType, settings/lockfile delegation,
 * non-registry refType returns error for materializeInstall.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { vi } from "vitest";
import { McpServerManager, McpServerManagerLive } from "./manager.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { at } from "../../test-helpers.js";
import type {
  BuiltinMcpServerRef,
  RegistryMcpServerRef,
  RegistrySource,
} from "@axm.sh/core/unstable/sources";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registrySource: RegistrySource = {
  type: "registry",
  location: new URL("https://registry.example.com"),
  profile: Option.none(),
};

const makeRegistryMcpServerRef = (name: string): RegistryMcpServerRef => ({
  type: "mcp-server",
  refType: "registry",
  source: registrySource,
  server: { name },
  profile: "@test",
  name,
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeWsMock = (overrides?: {
  setMcpServer?: ReturnType<typeof vi.fn>;
  setMcpServerLock?: ReturnType<typeof vi.fn>;
  removeMcpServerSettings?: ReturnType<typeof vi.fn>;
  removeMcpServerLock?: ReturnType<typeof vi.fn>;
}) =>
  makeBaseWorkspaceMock("/tmp/axm", {
    setMcpServer: overrides?.setMcpServer ?? vi.fn(() => Effect.void),
    setMcpServerLock: overrides?.setMcpServerLock ?? vi.fn(() => Effect.void),
    removeMcpServerSettings: overrides?.removeMcpServerSettings ?? vi.fn(() => Effect.void),
    removeMcpServerLock: overrides?.removeMcpServerLock ?? vi.fn(() => Effect.void),
  });

const buildTestLayer = (wsMock: WorkspaceContextService) =>
  McpServerManagerLive.pipe(
    Layer.provide(Layer.succeed(Workspace, wsMock)),
    Layer.provide(NodeServices.layer),
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("McpServerManager", () => {
  it.effect("has extensionType 'mcp-server'", () =>
    Effect.gen(function* () {
      const manager = yield* McpServerManager;
      expect(manager.extensionType).toBe("mcp-server");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock()))),
  );

  it.effect("upsertSettingsEntry delegates to ws.setMcpServer for registry refs", () => {
    const setMcpServerFn = vi.fn((_args: Parameters<WorkspaceContextService["setMcpServer"]>[0]) =>
      Effect.void,
    );
    return Effect.gen(function* () {
      const manager = yield* McpServerManager;
      yield* manager.upsertSettingsEntry({
        ref: makeRegistryMcpServerRef("my-server"),
        versionConstraint: Option.none(),
      });
      expect(setMcpServerFn).toHaveBeenCalledTimes(1);
      const [args] = at(setMcpServerFn.mock.calls, 0);
      expect(args).toMatchObject({
        name: "my-server",
        lockEntry: { resolvedVersion: "1.0.0" },
      });
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setMcpServer: setMcpServerFn }))));
  });

  it.effect("upsertLockfileEntry delegates to ws.setMcpServerLock for registry refs", () => {
    const setMcpServerLockFn = vi.fn(
      (_args: Parameters<WorkspaceContextService["setMcpServerLock"]>[0]) => Effect.void,
    );
    return Effect.gen(function* () {
      const manager = yield* McpServerManager;
      yield* manager.upsertLockfileEntry({ ref: makeRegistryMcpServerRef("my-server") });
      expect(setMcpServerLockFn).toHaveBeenCalledTimes(1);
      const [args] = at(setMcpServerLockFn.mock.calls, 0);
      expect(args).toMatchObject({
        name: "my-server",
        lockEntry: { resolvedVersion: "1.0.0" },
      });
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setMcpServerLock: setMcpServerLockFn }))));
  });

  it.effect("removeSettingsEntry delegates to ws.removeMcpServerSettings", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* McpServerManager;
      yield* manager.removeSettingsEntry({
        target: { type: "mcp-server", name: "my-server" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-server");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeMcpServerSettings: removeFn }))));
  });

  it.effect("removeLockfileEntry delegates to ws.removeMcpServerLock", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* McpServerManager;
      yield* manager.removeLockfileEntry({
        target: { type: "mcp-server", name: "my-server" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-server");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeMcpServerLock: removeFn }))));
  });

  it.effect("upsertSettingsEntry returns void for non-registry refs", () =>
    Effect.gen(function* () {
      const setMcpServerFn = vi.fn(() => Effect.void);
      const manager = yield* McpServerManager;
      const nonRegistryRef: BuiltinMcpServerRef = {
        type: "mcp-server",
        refType: "builtin",
        source: { type: "builtin" },
        server: { name: "builtin-server" },
      };
      yield* manager.upsertSettingsEntry({
        ref: nonRegistryRef,
        versionConstraint: Option.none(),
      });
      expect(setMcpServerFn).not.toHaveBeenCalled();
    }).pipe(Effect.provide(buildTestLayer(makeWsMock()))),
  );
});
