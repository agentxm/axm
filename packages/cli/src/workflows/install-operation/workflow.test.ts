/**
 * Tests for ExtensionTarget types, targetFromRef, toLabel, and install operation workflow.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type {
  PackExtensionRef,
  RegistrySource,
  SkillExtensionRef,
  CommandExtensionRef,
  McpServerExtensionRef,
} from "../../sources/types.js";
import {
  type ExtensionManager,
  type ExtensionTarget,
  buildInstallOperation,
  targetFromRef,
  toLabel,
} from "./workflow.js";

// -----------------------------------------------------------------------------
// Helpers — minimal refs for testing
// -----------------------------------------------------------------------------

const registrySource: RegistrySource = {
  type: "registry",
  location: new URL("https://registry.example.com"),
  namespace: Option.none(),
};

const makeSkillRef = (name: string): SkillExtensionRef => ({
  type: "skill",
  refType: "registry",
  source: registrySource,
  skill: { name, description: Option.none(), metadata: Option.none() },
  namespace: "test",
  name: "test-skill",
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeCommandRef = (name: string): CommandExtensionRef => ({
  type: "command",
  refType: "registry",
  source: registrySource,
  command: { name },
  namespace: "test",
  name: "test-command",
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeMcpServerRef = (name: string): McpServerExtensionRef => ({
  type: "mcp-server",
  refType: "registry",
  source: registrySource,
  server: { name },
  namespace: "test",
  name: "test-server",
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makePackRef = (name: string, namespace: string): PackExtensionRef => ({
  type: "pack",
  refType: "registry",
  source: registrySource,
  pack: { name, skills: {}, commands: {}, mcpServers: {} },
  namespace,
  name: "test-pack",
  version: "1.0.0",
  integrity: "sha512-abc",
});

// -----------------------------------------------------------------------------
// Task 2.1: ExtensionTarget type construction and helpers
// -----------------------------------------------------------------------------

describe("targetFromRef", () => {
  it("creates a skill target (name-only) from a skill ref", () => {
    const ref = makeSkillRef("code-review");
    const target = targetFromRef(ref);
    expect(target).toEqual({ type: "skill", name: "code-review" });
  });

  it("creates a command target (name-only) from a command ref", () => {
    const ref = makeCommandRef("formatter");
    const target = targetFromRef(ref);
    expect(target).toEqual({ type: "command", name: "formatter" });
  });

  it("creates an mcp-server target (name-only) from an mcp-server ref", () => {
    const ref = makeMcpServerRef("db-connector");
    const target = targetFromRef(ref);
    expect(target).toEqual({ type: "mcp-server", name: "db-connector" });
  });

  it("creates a pack target (with namespace) from a pack ref", () => {
    const ref = makePackRef("effect", "@axm");
    const target = targetFromRef(ref);
    expect(target).toEqual({ type: "pack", name: "effect", namespace: "@axm" });
  });
});

describe("toLabel", () => {
  it("returns name-only for skill target", () => {
    const target: ExtensionTarget = { type: "skill", name: "code-review" };
    expect(toLabel(target)).toBe("code-review");
  });

  it("returns name-only for command target", () => {
    const target: ExtensionTarget = { type: "command", name: "formatter" };
    expect(toLabel(target)).toBe("formatter");
  });

  it("returns name-only for mcp-server target", () => {
    const target: ExtensionTarget = { type: "mcp-server", name: "db-connector" };
    expect(toLabel(target)).toBe("db-connector");
  });

  it("returns namespace/name for pack target", () => {
    const target: ExtensionTarget = { type: "pack", name: "effect", namespace: "@axm" };
    expect(toLabel(target)).toBe("@axm/effect");
  });
});

// -----------------------------------------------------------------------------
// Task 2.6: runInstallOperation canonical sequence tests
// -----------------------------------------------------------------------------

describe("buildInstallOperation / runInstallOperation", () => {
  it("produces a ready step with the correct label", () => {
    const manager: ExtensionManager<SkillExtensionRef> = {
      extensionType: "skill",
      materializeInstall: () => Effect.void,
      materializeUninstall: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    };

    const ref = makeSkillRef("code-review");
    const step = buildInstallOperation(manager, {
      ref,
      versionConstraint: Option.none(),
    });

    expect(step.readiness).toBe("ready");
    expect(step.label).toBe("code-review");
  });

  it.effect("executes in canonical order: materialize -> lockfile -> settings", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager: ExtensionManager<SkillExtensionRef> = {
        extensionType: "skill",
        materializeInstall: () =>
          Effect.sync(() => {
            callOrder.push("materialize");
          }),
        materializeUninstall: () => Effect.void,
        upsertSettingsEntry: () =>
          Effect.sync(() => {
            callOrder.push("settings");
          }),
        removeSettingsEntry: () => Effect.void,
        upsertLockfileEntry: () =>
          Effect.sync(() => {
            callOrder.push("lockfile");
          }),
        removeLockfileEntry: () => Effect.void,
      };

      const ref = makeSkillRef("code-review");
      const step = buildInstallOperation(manager, {
        ref,
        versionConstraint: Option.some("^1.0.0"),
      });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const result = yield* step.run;
      expect(result.result).toBe("success");
      expect(callOrder).toEqual(["materialize", "lockfile", "settings"]);
    }),
  );

  it.effect("passes ref and versionConstraint to manager methods", () =>
    Effect.gen(function* () {
      let capturedInstallRef: SkillExtensionRef | undefined;
      let capturedLockfileRef: SkillExtensionRef | undefined;
      let capturedSettingsRef: SkillExtensionRef | undefined;
      let capturedConstraint: Option.Option<string> | undefined;

      const manager: ExtensionManager<SkillExtensionRef> = {
        extensionType: "skill",
        materializeInstall: (args) =>
          Effect.sync(() => {
            capturedInstallRef = args.ref;
          }),
        materializeUninstall: () => Effect.void,
        upsertSettingsEntry: (args) =>
          Effect.sync(() => {
            capturedSettingsRef = args.ref;
            capturedConstraint = args.versionConstraint;
          }),
        removeSettingsEntry: () => Effect.void,
        upsertLockfileEntry: (args) =>
          Effect.sync(() => {
            capturedLockfileRef = args.ref;
          }),
        removeLockfileEntry: () => Effect.void,
      };

      const ref = makeSkillRef("code-review");
      const step = buildInstallOperation(manager, {
        ref,
        versionConstraint: Option.some("^2.0.0"),
      });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      yield* step.run;

      expect(capturedInstallRef).toBe(ref);
      expect(capturedLockfileRef).toBe(ref);
      expect(capturedSettingsRef).toBe(ref);
      expect(capturedConstraint).toEqual(Option.some("^2.0.0"));
    }),
  );

  it.effect("returns error result when materialize fails", () =>
    Effect.gen(function* () {
      const manager: ExtensionManager<SkillExtensionRef> = {
        extensionType: "skill",
        materializeInstall: () =>
          Effect.fail(makeAppError({ code: "MATERIALIZE_FAILED", what: "disk error" })),
        materializeUninstall: () => Effect.void,
        upsertSettingsEntry: () => Effect.void,
        removeSettingsEntry: () => Effect.void,
        upsertLockfileEntry: () => Effect.void,
        removeLockfileEntry: () => Effect.void,
      };

      const ref = makeSkillRef("code-review");
      const step = buildInstallOperation(manager, {
        ref,
        versionConstraint: Option.none(),
      });

      if (step.readiness !== "ready") throw new Error("Expected ready step");
      // The run effect will fail with AppError — the caller (applyPlan) catches it
      const exit = yield* step.run.pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("works with pack refs (label includes namespace)", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];
      const manager: ExtensionManager<PackExtensionRef> = {
        extensionType: "pack",
        materializeInstall: () =>
          Effect.sync(() => {
            callOrder.push("materialize");
          }),
        materializeUninstall: () => Effect.void,
        upsertSettingsEntry: () =>
          Effect.sync(() => {
            callOrder.push("settings");
          }),
        removeSettingsEntry: () => Effect.void,
        upsertLockfileEntry: () =>
          Effect.sync(() => {
            callOrder.push("lockfile");
          }),
        removeLockfileEntry: () => Effect.void,
      };

      const ref = makePackRef("effect", "@axm");
      const step = buildInstallOperation(manager, {
        ref,
        versionConstraint: Option.none(),
      });

      expect(step.label).toBe("@axm/effect");
      if (step.readiness !== "ready") throw new Error("Expected ready step");
      const result = yield* step.run;
      expect(result.result).toBe("success");
      expect(callOrder).toEqual(["materialize", "lockfile", "settings"]);
    }),
  );
});
