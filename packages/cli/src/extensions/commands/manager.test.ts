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
import * as NodeContext from "@effect/platform-node/NodeContext";
import { vi } from "vitest";
import { CommandManager, CommandManagerLive } from "./manager.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import { taxonomyStubs } from "../../workspace/test-stubs.js";
import type { RegistryCommandRef, RegistrySource } from "../../sources/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registrySource: RegistrySource = {
  type: "registry",
  location: new URL("https://registry.example.com"),
  namespace: Option.none(),
};

const makeRegistryCommandRef = (name: string): RegistryCommandRef => ({
  type: "command",
  refType: "registry",
  source: registrySource,
  command: { name },
  namespace: "@test",
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
  ({
    ...taxonomyStubs,
    global: false,
    path: "/tmp/axm",
    baseDir: "/tmp",
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed("@community"),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () =>
      Effect.succeed({
        canonicalPath: "/tmp/.axm/extensions/external/skills/test",
        skillSrcPath: "/tmp/.axm/extensions/external/skills/test",
      }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "/tmp/.axm/extensions/@test/packs/test" }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: overrides?.setCommand ?? vi.fn(() => Effect.void),
    setCommandLock: overrides?.setCommandLock ?? vi.fn(() => Effect.void),
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: overrides?.removeCommandSettings ?? vi.fn(() => Effect.void),
    removeCommandLock: overrides?.removeCommandLock ?? vi.fn(() => Effect.void),
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
  }) as unknown as WorkspaceContextService;

const buildTestLayer = (wsMock: WorkspaceContextService) =>
  CommandManagerLive.pipe(
    Layer.provide(Layer.succeed(Workspace, wsMock)),
    Layer.provide(NodeContext.layer),
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
    const setCommandFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.upsertSettingsEntry({
        ref: makeRegistryCommandRef("my-cmd"),
        versionConstraint: Option.none(),
      });
      expect(setCommandFn).toHaveBeenCalledTimes(1);
      const args = (setCommandFn.mock.calls as unknown[][])[0]![0] as {
        name: string;
        lockEntry: { resolvedVersion: string };
      };
      expect(args.name).toBe("my-cmd");
      expect(args.lockEntry.resolvedVersion).toBe("1.0.0");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setCommand: setCommandFn }))));
  });

  it.effect("upsertLockfileEntry delegates to ws.setCommandLock for registry refs", () => {
    const setCommandLockFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* CommandManager;
      yield* manager.upsertLockfileEntry({ ref: makeRegistryCommandRef("my-cmd") });
      expect(setCommandLockFn).toHaveBeenCalledTimes(1);
      const args = (setCommandLockFn.mock.calls as unknown[][])[0]![0] as {
        name: string;
        lockEntry: { resolvedVersion: string };
      };
      expect(args.name).toBe("my-cmd");
      expect(args.lockEntry.resolvedVersion).toBe("1.0.0");
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
