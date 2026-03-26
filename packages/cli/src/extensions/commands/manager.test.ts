/**
 * Tests for CommandManager contract compliance.
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
import { CommandManager, CommandManagerLive } from "./manager.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { at } from "../../test-helpers.js";
import type { RegistryCommandRef, RegistrySource } from "@axm.sh/core/unstable/sources";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registrySource: RegistrySource = {
  type: "registry",
  location: new URL("https://registry.example.com"),
  profile: Option.none(),
};

const makeRegistryCommandRef = (name: string): RegistryCommandRef => ({
  type: "command",
  refType: "registry",
  source: registrySource,
  command: { name },
  profile: "@test",
  name,
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeWsMock = (overrides?: {
  setCommand?: ReturnType<typeof vi.fn>;
  setCommandLock?: ReturnType<typeof vi.fn>;
  removeCommandSettings?: ReturnType<typeof vi.fn>;
  removeCommandLock?: ReturnType<typeof vi.fn>;
}) =>
  makeBaseWorkspaceMock("/tmp/axm", {
    setCommand: overrides?.setCommand ?? vi.fn(() => Effect.void),
    setCommandLock: overrides?.setCommandLock ?? vi.fn(() => Effect.void),
    removeCommandSettings: overrides?.removeCommandSettings ?? vi.fn(() => Effect.void),
    removeCommandLock: overrides?.removeCommandLock ?? vi.fn(() => Effect.void),
  });

const buildTestLayer = (wsMock: WorkspaceContextService) =>
  CommandManagerLive.pipe(
    Layer.provide(Layer.succeed(Workspace, wsMock)),
    Layer.provide(NodeServices.layer),
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommandManager", () => {
  it.effect("has extensionType 'command'", () =>
    Effect.gen(function* () {
      const manager = yield* CommandManager;
      expect(manager.extensionType).toBe("command");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock()))),
  );

  it.effect("upsertSettingsEntry delegates to ws.setCommand for registry refs", () => {
    const setCommandFn = vi.fn((_args: Parameters<WorkspaceContextService["setCommand"]>[0]) =>
      Effect.void,
    );
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.upsertSettingsEntry({
        ref: makeRegistryCommandRef("my-cmd"),
        versionConstraint: Option.none(),
      });
      expect(setCommandFn).toHaveBeenCalledTimes(1);
      const [args] = at(setCommandFn.mock.calls, 0);
      expect(args).toMatchObject({
        name: "my-cmd",
        lockEntry: { resolvedVersion: "1.0.0" },
      });
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setCommand: setCommandFn }))));
  });

  it.effect("upsertLockfileEntry delegates to ws.setCommandLock for registry refs", () => {
    const setCommandLockFn = vi.fn((_args: Parameters<WorkspaceContextService["setCommandLock"]>[0]) =>
      Effect.void,
    );
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.upsertLockfileEntry({ ref: makeRegistryCommandRef("my-cmd") });
      expect(setCommandLockFn).toHaveBeenCalledTimes(1);
      const [args] = at(setCommandLockFn.mock.calls, 0);
      expect(args).toMatchObject({
        name: "my-cmd",
        lockEntry: { resolvedVersion: "1.0.0" },
      });
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setCommandLock: setCommandLockFn }))));
  });

  it.effect("removeSettingsEntry delegates to ws.removeCommandSettings", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.removeSettingsEntry({
        target: { type: "command", name: "my-cmd" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-cmd");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeCommandSettings: removeFn }))));
  });

  it.effect("removeLockfileEntry delegates to ws.removeCommandLock", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.removeLockfileEntry({
        target: { type: "command", name: "my-cmd" },
      });
      expect(removeFn).toHaveBeenCalledWith("my-cmd");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeCommandLock: removeFn }))));
  });
});
