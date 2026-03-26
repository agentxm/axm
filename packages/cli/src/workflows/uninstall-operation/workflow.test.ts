/**
 * Tests for the uninstall operation workflow.
 *
 * Verifies retention path (settings removal + lockfile retention) vs
 * full removal path (disk + lockfile + settings).
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type {
  ExtensionManager,
  ExtensionTarget,
  SkillExtensionTarget,
  PackExtensionTarget,
  UninstallRetentionPolicy,
} from "../install-operation/workflow.js";
import { buildUninstallOperation } from "./workflow.js";
import type { SkillExtensionRef, PackExtensionRef } from "@axm.sh/core/unstable/sources";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkillManager = (callOrder: string[]): ExtensionManager<SkillExtensionRef> => ({
  extensionType: "skill",
  isInstalled: () => Effect.succeed(true),
  materializeInstall: () =>
    Effect.sync(() => {
      callOrder.push("materializeInstall");
    }),
  materializeUninstall: () =>
    Effect.sync(() => {
      callOrder.push("materializeUninstall");
    }),
  upsertSettingsEntry: () =>
    Effect.sync(() => {
      callOrder.push("upsertSettings");
    }),
  removeSettingsEntry: () =>
    Effect.sync(() => {
      callOrder.push("removeSettings");
    }),
  upsertLockfileEntry: () =>
    Effect.sync(() => {
      callOrder.push("upsertLockfile");
    }),
  removeLockfileEntry: () =>
    Effect.sync(() => {
      callOrder.push("removeLockfile");
    }),
});

const makeRetentionPolicy = (
  isRequired: boolean,
  callOrder: string[],
): UninstallRetentionPolicy => ({
  isRequiredByInstalledPack: () =>
    Effect.sync(() => {
      callOrder.push("isRequiredByInstalledPack");
      return isRequired;
    }),
  markDependencyRetainedInLockfile: () =>
    Effect.sync(() => {
      callOrder.push("markDependencyRetainedInLockfile");
    }),
});

// -----------------------------------------------------------------------------
// Task 2.8: Uninstall operation tests
// -----------------------------------------------------------------------------

describe("buildUninstallOperation / runUninstallOperation", () => {
  it("produces a ready step with the correct label for skill targets", () => {
    const callOrder: string[] = [];
    const manager = makeSkillManager(callOrder);
    const retentionPolicy = makeRetentionPolicy(false, callOrder);

    const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
    const step = buildUninstallOperation(manager, retentionPolicy, { target });

    expect(step.readiness).toBe("ready");
    expect(step.label).toBe("code-review");
  });

  it.effect("returns a no-op message when the target is not installed", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager: ExtensionManager<SkillExtensionRef> = {
        ...makeSkillManager(callOrder),
        isInstalled: () => Effect.succeed(false),
      };
      const retentionPolicy = makeRetentionPolicy(false, callOrder);

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const result = yield* step.run;

      expect(result.result).toBe("success");
      expect(result.message).toContain("not installed");
      expect(callOrder).toEqual([]);
    }),
  );

  it.effect("full removal path: disk -> lockfile -> settings when not required by pack", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager = makeSkillManager(callOrder);
      const retentionPolicy = makeRetentionPolicy(false, callOrder);

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const result = yield* step.run;

      expect(result.result).toBe("success");
      expect(callOrder).toEqual([
        "isRequiredByInstalledPack",
        "materializeUninstall",
        "removeLockfile",
        "removeSettings",
      ]);
    }),
  );

  it.effect("retention path: settings removal + lockfile retention when required by pack", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager = makeSkillManager(callOrder);
      const retentionPolicy = makeRetentionPolicy(true, callOrder);

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const result = yield* step.run;

      expect(result.result).toBe("success");
      expect(result.message).toContain("still required by an installed pack");
      expect(callOrder).toEqual([
        "isRequiredByInstalledPack",
        "removeSettings",
        "markDependencyRetainedInLockfile",
      ]);
    }),
  );

  it.effect("retention path does NOT call materializeUninstall or removeLockfileEntry", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager = makeSkillManager(callOrder);
      const retentionPolicy = makeRetentionPolicy(true, callOrder);

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      yield* step.run;

      expect(callOrder).not.toContain("materializeUninstall");
      expect(callOrder).not.toContain("removeLockfile");
    }),
  );

  it.effect("passes target to retention policy and manager methods", () =>
    Effect.gen(function* () {
      let capturedPolicyTarget: ExtensionTarget | undefined;
      let capturedUninstallTarget: SkillExtensionTarget | undefined;
      let capturedRemoveLockTarget: SkillExtensionTarget | undefined;
      let capturedRemoveSettingsTarget: SkillExtensionTarget | undefined;

      const manager: ExtensionManager<SkillExtensionRef> = {
        extensionType: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.void,
        materializeUninstall: (args) =>
          Effect.sync(() => {
            capturedUninstallTarget = args.target;
          }),
        upsertSettingsEntry: () => Effect.void,
        removeSettingsEntry: (args) =>
          Effect.sync(() => {
            capturedRemoveSettingsTarget = args.target;
          }),
        upsertLockfileEntry: () => Effect.void,
        removeLockfileEntry: (args) =>
          Effect.sync(() => {
            capturedRemoveLockTarget = args.target;
          }),
      };

      const callOrder: string[] = [];
      const retentionPolicy: UninstallRetentionPolicy = {
        isRequiredByInstalledPack: (args) =>
          Effect.sync(() => {
            capturedPolicyTarget = args.target;
            return false;
          }),
        markDependencyRetainedInLockfile: () =>
          Effect.sync(() => {
            callOrder.push("markRetained");
          }),
      };

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      yield* step.run;

      expect(capturedPolicyTarget).toEqual(target);
      expect(capturedUninstallTarget).toEqual(target);
      expect(capturedRemoveLockTarget).toEqual(target);
      expect(capturedRemoveSettingsTarget).toEqual(target);
    }),
  );

  it.effect("returns error when materializeUninstall fails", () =>
    Effect.gen(function* () {
      const manager: ExtensionManager<SkillExtensionRef> = {
        extensionType: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.void,
        materializeUninstall: () =>
          Effect.fail(makeAppError({ code: "UNMATERIALIZE_FAILED", what: "disk error" })),
        upsertSettingsEntry: () => Effect.void,
        removeSettingsEntry: () => Effect.void,
        upsertLockfileEntry: () => Effect.void,
        removeLockfileEntry: () => Effect.void,
      };

      const callOrder: string[] = [];
      const retentionPolicy = makeRetentionPolicy(false, callOrder);

      const target: SkillExtensionTarget = { type: "skill", name: "code-review" };
      const step = buildUninstallOperation(manager, retentionPolicy, { target });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const exit = yield* step.run.pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }),
  );

  it("pack target label includes profile", () => {
    const callOrder: string[] = [];
    const manager: ExtensionManager<PackExtensionRef> = {
      extensionType: "pack",
      isInstalled: () => Effect.succeed(true),
      materializeInstall: () => Effect.void,
      materializeUninstall: () =>
        Effect.sync(() => {
          callOrder.push("materializeUninstall");
        }),
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () =>
        Effect.sync(() => {
          callOrder.push("removeSettings");
        }),
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () =>
        Effect.sync(() => {
          callOrder.push("removeLockfile");
        }),
    };

    const retentionPolicy = makeRetentionPolicy(false, callOrder);
    const target: PackExtensionTarget = { type: "pack", name: "effect", profile: "@axm" };
    const step = buildUninstallOperation(manager, retentionPolicy, { target });

    expect(step.label).toBe("@axm/effect");
  });
});
