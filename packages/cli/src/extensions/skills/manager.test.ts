/**
 * Tests for SkillManager contract compliance.
 *
 * Verifies: extensionType, all 6 ExtensionManager methods,
 * settings/lockfile delegation, lock entry includes agents field.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { vi } from "vitest";
import { SkillManager, SkillManagerLive } from "./manager.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { at } from "../../test-helpers.js";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "../../sources/index.js";
import type { SourceHostProvidersService } from "../../sources/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeLocalSkillRef = (name: string): SkillExtensionRef => ({
  type: "skill",
  refType: "local",
  source: { type: "local", path: "/tmp/skill" },
  skill: { name, description: Option.none(), metadata: Option.none() },
  location: "/tmp/skill",
});

const makeWsMock = (overrides?: {
  setSkill?: ReturnType<typeof vi.fn>;
  setSkillLock?: ReturnType<typeof vi.fn>;
  removeSkillFromSettings?: ReturnType<typeof vi.fn>;
  removeSkillLock?: ReturnType<typeof vi.fn>;
}) =>
  makeBaseWorkspaceMock("/tmp/axm", {
    setSkill: overrides?.setSkill ?? vi.fn(() => Effect.void),
    setSkillLock: overrides?.setSkillLock ?? vi.fn(() => Effect.void),
    removeSkillFromSettings: overrides?.removeSkillFromSettings ?? vi.fn(() => Effect.void),
    removeSkillLock: overrides?.removeSkillLock ?? vi.fn(() => Effect.void),
  });

const makeSourcesMock = (): SourceHostProvidersService => ({
  find: () => Effect.succeed([]),
  fetch: () => Effect.succeed({ directory: "/tmp/fetched" }),
  cloneUrl: () => Option.none(),
  origin: () => "mock",
});

const buildTestLayer = (wsMock: WorkspaceContextService) =>
  SkillManagerLive.pipe(
    Layer.provide(Layer.succeed(Workspace, wsMock)),
    Layer.provide(Layer.succeed(SourceHostProviders, makeSourcesMock())),
    Layer.provide(NodeServices.layer),
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillManager", () => {
  it.effect("has extensionType 'skill'", () =>
    Effect.gen(function* () {
      const manager = yield* SkillManager;
      expect(manager.extensionType).toBe("skill");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock()))),
  );

  it.effect("removeSettingsEntry delegates to ws.removeSkillFromSettings", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* SkillManager;
      yield* manager.removeSettingsEntry({ target: { type: "skill", name: "my-skill" } });
      expect(removeFn).toHaveBeenCalledWith("my-skill");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeSkillFromSettings: removeFn }))));
  });

  it.effect("removeLockfileEntry delegates to ws.removeSkillLock", () => {
    const removeFn = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const manager = yield* SkillManager;
      yield* manager.removeLockfileEntry({ target: { type: "skill", name: "my-skill" } });
      expect(removeFn).toHaveBeenCalledWith("my-skill");
    }).pipe(Effect.provide(buildTestLayer(makeWsMock({ removeSkillLock: removeFn }))));
  });

  it.effect(
    "upsertSettingsEntry delegates to ws.setSkill with lock entry containing agents",
    () => {
      const setSkillFn = vi.fn((_args: Parameters<WorkspaceContextService["setSkill"]>[0]) =>
        Effect.void,
      );
      return Effect.gen(function* () {
        const manager = yield* SkillManager;
        const ref = makeLocalSkillRef("my-skill");
        yield* manager.upsertSettingsEntry({ ref, versionConstraint: Option.none() });
        expect(setSkillFn).toHaveBeenCalledTimes(1);
        const [args] = at(setSkillFn.mock.calls, 0);
        expect(args).toMatchObject({
          name: "my-skill",
          lockEntry: { agents: ["claude-code"] },
        });
      }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setSkill: setSkillFn }))));
    },
  );

  it.effect(
    "upsertLockfileEntry delegates to ws.setSkillLock with lock entry containing agents",
    () => {
      const setSkillLockFn = vi.fn(
        (_args: Parameters<WorkspaceContextService["setSkillLock"]>[0]) => Effect.void,
      );
      return Effect.gen(function* () {
        const manager = yield* SkillManager;
        const ref = makeLocalSkillRef("my-skill");
        yield* manager.upsertLockfileEntry({ ref });
        expect(setSkillLockFn).toHaveBeenCalledTimes(1);
        const [args] = at(setSkillLockFn.mock.calls, 0);
        expect(args).toMatchObject({
          name: "my-skill",
          lockEntry: { agents: ["claude-code"] },
        });
        expect(args.versionConstraint).toEqual(Option.none());
      }).pipe(Effect.provide(buildTestLayer(makeWsMock({ setSkillLock: setSkillLockFn }))));
    },
  );
});
