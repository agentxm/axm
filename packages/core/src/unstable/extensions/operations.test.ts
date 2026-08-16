/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  formatPackageUrlParts,
  toLabelWithCompanions,
  toStepKey,
} from "./operations.js";
import { makeAppError } from "../app-error/index.js";
import { computeSourceHash } from "./rendered-files.js";
import {
  exactVersion,
  extensionName,
  fullyQualifiedName,
  handle,
  packageUrl,
} from "../test-helpers.js";
import type {
  ExtensionManager,
  WorkspaceTransactionRunner,
} from "../workspace/service-interface.js";
import type { RegistrySkillRef, SkillExtensionRef, WorkspaceSkillRef } from "../skills/refs.js";

const runTransaction: WorkspaceTransactionRunner = (args) =>
  Effect.gen(function* () {
    const value = yield* args.transition;
    yield* args.validate(value);
    return value;
  });

const authoredSkillRef = (): WorkspaceSkillRef => {
  const name = extensionName("review");
  return {
    type: "skill",
    refType: "workspace",
    source: {
      type: "workspace",
      owner: handle("@acme"),
      extensionType: "skill",
      name,
    },
    owner: handle("@acme"),
    name,
    version: exactVersion("1.0.0"),
    scope: "project",
    location: "file:///workspace/.axm/extensions/@acme/skills/review",
    sourceHash: computeSourceHash("review"),
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};

describe("formatPackageUrlParts", () => {
  it("formats type and name", () => {
    const parts = packageUrl("pkg:npm/react");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react");
  });

  it("includes namespace when present", () => {
    const parts = packageUrl("pkg:npm/%40angular/core");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core");
  });

  it("includes version when present", () => {
    const parts = packageUrl("pkg:npm/react@18.2.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react@18.2.0");
  });

  it("includes namespace and version together", () => {
    const parts = packageUrl("pkg:npm/%40angular/core@18.0.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core@18.0.0");
  });

  it("handles pypi type", () => {
    const parts = packageUrl("pkg:pypi/django");
    expect(formatPackageUrlParts(parts)).toBe("pkg:pypi/django");
  });
});

describe("toLabelWithCompanions", () => {
  it("returns base label when packages is empty", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "my-skill" }, []);
    expect(result).toBe("my-skill");
  });

  it("appends single companionPackage in parentheses", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "react-testing" }, [
      packageUrl("pkg:npm/react"),
    ]);
    expect(result).toBe("react-testing (pkg:npm/react)");
  });

  it("appends multiple packages comma-separated", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "fullstack" }, [
      packageUrl("pkg:npm/react"),
      packageUrl("pkg:npm/typescript"),
    ]);
    expect(result).toBe("fullstack (pkg:npm/react, pkg:npm/typescript)");
  });

  it("works with pack targets", () => {
    const result = toLabelWithCompanions(
      { type: "pack", name: "frontend", owner: handle("@acme") },
      [packageUrl("pkg:npm/react")],
    );
    expect(result).toBe("@acme/frontend (pkg:npm/react)");
  });
});

describe("toStepKey", () => {
  it("includes the extension type for non-pack targets", () => {
    expect(toStepKey({ type: "skill", name: "lint" })).toBe("skill:lint");
    expect(toStepKey({ type: "rule", name: "lint" })).toBe("rule:lint");
  });

  it("includes the owner for pack targets", () => {
    expect(toStepKey({ type: "pack", name: "frontend", owner: handle("@acme") })).toBe(
      "pack:@acme/frontend",
    );
  });
});

describe("buildInstallOperation", () => {
  it("marks an exact yanked registry install as warning-ready", () => {
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(false),
      materializeInstall: () => Effect.void,
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const name = extensionName("review");
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      source: {
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
      lifecycleWarnings: ["@acme/skills/review@1.0.0 is yanked"],
      skill: { name, description: Option.none(), metadata: Option.none() },
    };

    const operation = buildInstallOperation(manager, {
      ref,
      versionRange: Option.none(),
    });

    expect(operation).toMatchObject({
      readiness: "warn",
      warnMessage: "@acme/skills/review@1.0.0 is yanked",
    });
  });

  it("retains structured deprecation evidence independently from yank warnings", async () => {
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(true),
      materializeInstall: () => Effect.void,
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const name = extensionName("review");
    const deprecation = {
      deprecatedAt: DateTime.makeUnsafe("2026-03-01T00:00:00.000Z"),
      message: "Move review workflows.",
      replacement: {
        status: "available" as const,
        fqn: fullyQualifiedName("@acme/skills/reviewer"),
      },
    };
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",
      publisherBindingId: "hbnd_test",
      source: {
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
      deprecation,
      lifecycleWarnings: ["@acme/skills/review@1.0.0 is yanked"],
      skill: { name, description: Option.none(), metadata: Option.none() },
    };

    const operation = buildInstallOperation(manager, {
      ref,
      versionRange: Option.none(),
      buildArtifact: () =>
        Effect.succeed({ path: ".axm/extensions/review", scope: "project", change: "created" }),
    });

    expect(operation).toMatchObject({
      readiness: "warn",
      registryLifecycle: { deprecation },
    });
    if (operation.readiness !== "warn") throw new Error("Expected warning-ready install");
    expect(operation.warnMessage).toContain("@acme/skills/review is deprecated");
    expect(operation.warnMessage).toContain("@acme/skills/review@1.0.0 is yanked");
    const result = await Effect.runPromise(operation.run);
    expect(result).toMatchObject({
      result: "success",
      artifact: { registryLifecycle: { deprecation } },
    });
  });

  it("rejects installing over a workspace source before materialization", async () => {
    const materializeInstall = vi.fn(() => Effect.void);
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(true),
      materializeInstall,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const name = extensionName("review");
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      source: {
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
      skill: { name, description: Option.none(), metadata: Option.none() },
    };

    const operation = buildInstallOperation(manager, {
      ref,
      versionRange: Option.none(),
    });
    if (operation.readiness !== "ready") {
      throw new Error("Expected install operation to be ready");
    }
    const result = await Effect.runPromise(
      operation.run.pipe(
        Effect.match({
          onFailure: (error) => ({ type: "failure", error }) as const,
          onSuccess: () => ({ type: "success" }) as const,
        }),
      ),
    );
    if (result.type !== "failure") {
      throw new Error("Expected workspace source protection to reject the install");
    }

    expect(result.error.code).toBe("conflict");
    expect(result.error.detail).toContain("Cannot install over workspace-sourced skill");
    expect(result.error.suggestions).toHaveLength(1);
    expect(materializeInstall).not.toHaveBeenCalled();
  });
});

describe("buildNewExtensionStep", () => {
  const workspaceRef = (): WorkspaceSkillRef => {
    const name = extensionName("review");
    return {
      type: "skill",
      refType: "workspace",
      source: {
        type: "workspace",
        owner: handle("@acme"),
        extensionType: "skill",
        name,
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      scope: "project",
      location: "file:///workspace/.axm/extensions/@acme/skills/review",
      sourceHash: computeSourceHash("review"),
      skill: { name, description: Option.none(), metadata: Option.none() },
    };
  };

  it("preflights materializability before scaffolding", async () => {
    const scaffold = vi.fn(() => Effect.void);
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(false),
      materializeInstall: () => Effect.void,
      listMaterializable: () =>
        Effect.fail(makeAppError({ code: "conflict", detail: "invalid pack" })),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const step = buildNewExtensionStep(manager, {
      target: { type: "skill", name: "review" },
      ref: workspaceRef(),
      versionRange: Option.none(),
      scaffold: Effect.suspend(scaffold),
      markAuthored: Effect.void,
      message: "Created review",
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);

    await Effect.runPromise(Effect.flip(step.run));

    expect(scaffold).not.toHaveBeenCalled();
  });

  it.each(["scaffold", "mark-authored", "resolve", "materialize", "commit"] as const)(
    "rolls back every authoritative surface when %s fails",
    async (failureAt) => {
      const state = {
        canonical: false,
        settings: false,
        lock: false,
        projection: false,
      };
      const transactionalRun: WorkspaceTransactionRunner = (transaction) => {
        const before = { ...state };
        return runTransaction(transaction).pipe(
          Effect.tapError(() =>
            Effect.sync(() => {
              Object.assign(state, before);
            }),
          ),
        );
      };
      let listCalls = 0;
      const fail = () => Effect.fail(makeAppError({ code: "internal", detail: failureAt }));
      const manager = {
        type: "skill",
        runTransaction: transactionalRun,
        isInstalled: () => Effect.succeed(false),
        listMaterializable: () => {
          listCalls += 1;
          if (listCalls === 2 && failureAt === "resolve") return fail();
          return Effect.succeed(listCalls === 1 ? [] : [workspaceRef()]);
        },
        materializeInstall: () =>
          Effect.gen(function* () {
            state.projection = true;
            if (failureAt === "materialize") return yield* fail();
          }),
        materializeUninstall: () =>
          Effect.sync(() => {
            state.canonical = false;
            state.projection = false;
          }),
        materializeDeactivate: () => Effect.void,
        upsertSettingsEntry: () =>
          Effect.gen(function* () {
            state.settings = true;
            if (failureAt === "commit") return yield* fail();
          }),
        removeSettingsEntry: () =>
          Effect.sync(() => {
            state.settings = false;
          }),
        upsertLockfileEntry: () => Effect.void,
        removeLockfileEntry: () =>
          Effect.sync(() => {
            state.lock = false;
          }),
      } satisfies ExtensionManager<SkillExtensionRef>;
      const step = buildNewExtensionStep(manager, {
        target: { type: "skill", name: "review" },
        ref: workspaceRef(),
        versionRange: Option.none(),
        scaffold: Effect.gen(function* () {
          state.canonical = true;
          if (failureAt === "scaffold") return yield* fail();
        }),
        markAuthored: Effect.gen(function* () {
          state.settings = true;
          if (failureAt === "mark-authored") return yield* fail();
        }),
        message: "Created review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      await Effect.runPromise(Effect.flip(step.run));

      expect(state).toEqual({
        canonical: false,
        settings: false,
        lock: false,
        projection: false,
      });
    },
  );
});

describe("buildAuthoredExtensionStep", () => {
  it("protects additional authored transition files in the workspace transaction", async () => {
    let transactionTargets: ReadonlyArray<string> = [];
    const transactionalRun: WorkspaceTransactionRunner = (args) => {
      transactionTargets = args.targets ?? [];
      return runTransaction(args);
    };
    const ref = authoredSkillRef();
    const manager = {
      type: "skill",
      runTransaction: transactionalRun,
      isInstalled: () => Effect.succeed(false),
      listMaterializable: () => Effect.succeed([ref]),
      materializeInstall: () => Effect.void,
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
    } satisfies ExtensionManager<SkillExtensionRef>;
    const step = buildAuthoredExtensionStep(manager, {
      target: { type: "skill", name: extensionName("review") },
      location: ref.location,
      transactionTargets: ["/workspace/native.json", ref.location],
      versionRange: Option.none(),
      scaffold: Effect.void,
      markAuthored: Effect.void,
      enabled: false,
      message: "Imported review",
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);

    await Effect.runPromise(step.run);

    expect(transactionTargets).toEqual([ref.location, "/workspace/native.json"].sort());
  });

  it("permits an explicit configured-source transition without the global preflight", async () => {
    const ref = authoredSkillRef();
    let listCalls = 0;
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(true),
      listMaterializable: () => {
        listCalls += 1;
        return listCalls === 1
          ? Effect.succeed([ref])
          : Effect.fail(makeAppError({ code: "conflict", detail: "unexpected preflight" }));
      },
      materializeInstall: () => Effect.void,
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
    } satisfies ExtensionManager<SkillExtensionRef>;
    const step = buildAuthoredExtensionStep(manager, {
      target: { type: "skill", name: extensionName("review") },
      location: ref.location,
      versionRange: Option.none(),
      scaffold: Effect.void,
      markAuthored: Effect.void,
      allowConfiguredSourceTransition: true,
      message: "Imported review",
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);

    await Effect.runPromise(step.run);

    expect(listCalls).toBe(1);
  });

  it("commits authored desired state but deactivates a disabled target", async () => {
    const calls: string[] = [];
    const ref = authoredSkillRef();
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(false),
      listMaterializable: () => Effect.succeed([ref]),
      materializeInstall: () => Effect.sync(() => calls.push("materialize")),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.sync(() => calls.push("deactivate")),
      upsertSettingsEntry: () => Effect.sync(() => calls.push("settings")),
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.sync(() => calls.push("accepted-resolution")),
      removeLockfileEntry: () => Effect.void,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
    } satisfies ExtensionManager<SkillExtensionRef>;
    const step = buildAuthoredExtensionStep(manager, {
      target: { type: "skill", name: extensionName("review") },
      location: ref.location,
      versionRange: Option.none(),
      scaffold: Effect.void,
      markAuthored: Effect.void,
      enabled: false,
      materializeWhenDisabled: true,
      message: "Forked review",
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);

    await Effect.runPromise(step.run);

    expect(calls).toEqual(["materialize", "settings", "deactivate"]);
  });

  it("does not touch projections for a disabled authored target by default", async () => {
    const calls: string[] = [];
    const ref = authoredSkillRef();
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(false),
      listMaterializable: () => Effect.succeed([ref]),
      materializeInstall: () => Effect.sync(() => calls.push("materialize")),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.sync(() => calls.push("deactivate")),
      upsertSettingsEntry: () => Effect.sync(() => calls.push("settings")),
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.sync(() => calls.push("accepted-resolution")),
      removeLockfileEntry: () => Effect.void,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
    } satisfies ExtensionManager<SkillExtensionRef>;
    const step = buildAuthoredExtensionStep(manager, {
      target: { type: "skill", name: extensionName("review") },
      location: ref.location,
      versionRange: Option.none(),
      scaffold: Effect.void,
      markAuthored: Effect.void,
      enabled: false,
      message: "Imported review",
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);

    await Effect.runPromise(step.run);

    expect(calls).toEqual(["settings"]);
  });
});

describe("buildMaterializeOperation", () => {
  it("persists the accepted resolution only after materialization succeeds", async () => {
    const calls: string[] = [];
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(true),
      materializeInstall: () => Effect.sync(() => calls.push("materialize")),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.sync(() => calls.push("accepted-resolution")),
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const name = extensionName("review");
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",
      publisherBindingId: "hbnd_test",
      source: {
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
      skill: { name, description: Option.none(), metadata: Option.none() },
    };
    const operation = buildMaterializeOperation(manager, { ref });
    if (operation.readiness === "error") {
      throw new Error(operation.errorMessage);
    }

    await Effect.runPromise(operation.run);

    expect(calls).toEqual(["materialize", "accepted-resolution"]);
  });
});

describe("buildUninstallOperation", () => {
  it.each(["materialize", "settings", "lock", "validate"] as const)(
    "restores all authoritative state when uninstall %s fails",
    async (failureAt) => {
      const state = {
        canonical: true,
        projection: true,
        settings: true,
        lock: true,
      };
      const transactionalRun: WorkspaceTransactionRunner = (transaction) => {
        const before = { ...state };
        return runTransaction(transaction).pipe(
          Effect.tapError(() =>
            Effect.sync(() => {
              Object.assign(state, before);
            }),
          ),
        );
      };
      const fail = () => Effect.fail(makeAppError({ code: "internal", detail: failureAt }));
      const manager = {
        type: "skill",
        runTransaction: transactionalRun,
        isInstalled: () =>
          Effect.succeed(failureAt === "validate" ? true : state.canonical || state.projection),
        materializeInstall: () => Effect.void,
        getConfiguredSource: () =>
          Effect.succeed(state.settings ? Option.some("@acme/skills/review") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () =>
          Effect.gen(function* () {
            state.canonical = false;
            state.projection = false;
            if (failureAt === "materialize") return yield* fail();
          }),
        materializeDeactivate: () => Effect.void,
        upsertSettingsEntry: () => Effect.void,
        removeSettingsEntry: () =>
          Effect.gen(function* () {
            state.settings = false;
            if (failureAt === "settings") return yield* fail();
          }),
        upsertLockfileEntry: () => Effect.void,
        removeLockfileEntry: () =>
          Effect.gen(function* () {
            state.lock = false;
            if (failureAt === "lock") return yield* fail();
          }),
      } satisfies ExtensionManager<SkillExtensionRef>;
      const operation = buildUninstallOperation<SkillExtensionRef>(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        { target: { type: "skill", name: "review" } },
      );
      if (operation.readiness === "error") throw new Error(operation.errorMessage);

      await Effect.runPromise(Effect.flip(operation.run));

      expect(state).toEqual({
        canonical: true,
        projection: true,
        settings: true,
        lock: true,
      });
    },
  );

  it("removes workspace-authored source without a disposition override", async () => {
    let installed = true;
    const materializeUninstall = vi.fn(() =>
      Effect.sync(() => {
        installed = false;
      }),
    );
    let configured = true;
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(installed),
      materializeInstall: () => Effect.void,
      getConfiguredSource: () =>
        Effect.succeed(configured ? Option.some("workspace:@acme/skills/review") : Option.none()),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () =>
        Effect.sync(() => {
          configured = false;
        }),
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const operation = buildUninstallOperation<SkillExtensionRef>(
      manager,
      { isRequiredByInstalledPack: () => Effect.succeed(false) },
      { target: { type: "skill", name: "review" } },
    );
    if (operation.readiness === "error") {
      throw new Error(operation.errorMessage);
    }

    await Effect.runPromise(operation.run);

    expect(materializeUninstall).toHaveBeenCalledWith({
      target: { type: "skill", name: "review" },
    });
  });

  it("does not turn an orphan accepted resolution into installed state during uninstall", async () => {
    const removeLockfileEntry = vi.fn(() => Effect.void);
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(false),
      materializeInstall: () => Effect.void,
      getConfiguredSource: () => Effect.succeed(Option.none()),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const operation = buildUninstallOperation<SkillExtensionRef>(
      manager,
      { isRequiredByInstalledPack: () => Effect.succeed(false) },
      { target: { type: "skill", name: "review" } },
    );
    if (operation.readiness === "error") {
      throw new Error(operation.errorMessage);
    }

    await Effect.runPromise(operation.run);

    expect(removeLockfileEntry).not.toHaveBeenCalled();
  });

  it("preserves an accepted resolution while a desired pack retains the extension", async () => {
    const removeLockfileEntry = vi.fn(() => Effect.void);
    let configured = true;
    const manager = {
      type: "skill",
      runTransaction,
      isInstalled: () => Effect.succeed(true),
      materializeInstall: () => Effect.void,
      getConfiguredSource: () =>
        Effect.succeed(configured ? Option.some("@acme/skills/review") : Option.none()),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      materializeDeactivate: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () =>
        Effect.sync(() => {
          configured = false;
        }),
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const operation = buildUninstallOperation<SkillExtensionRef>(
      manager,
      { isRequiredByInstalledPack: () => Effect.succeed(true) },
      { target: { type: "skill", name: "review" } },
    );
    if (operation.readiness === "error") {
      throw new Error(operation.errorMessage);
    }

    await Effect.runPromise(operation.run);

    expect(removeLockfileEntry).not.toHaveBeenCalled();
  });
});
