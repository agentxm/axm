/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { protectWorkspacePath } from "@agentxm/workspace-transactions";
import { WorkspaceTransactionScopeTest } from "@agentxm/workspace-transactions/testing";
import { NativeWriteAuthorityPermissive } from "@agentxm/agent-integration/testing";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
import type { CallerStepFailure } from "./operations.js";
import { SourceAuthorityBlocked } from "@agentxm/extension-resolution";
import { StepFailure } from "@agentxm/workspace-operations";
import { computeSourceHash } from "@agentxm/workspace-state";
import {
  recipeWorkspace,
  type RecipeWriteFaults,
  exactVersion,
  extensionName,
  fullyQualifiedName,
  handle,
  packageUrl,
} from "../test-helpers.js";
import type {
  ExtensionManager,
  ManagerRequirements,
  MaterializationFacts,
} from "@agentxm/extension-materialization";
import { NO_MATERIALIZATION_OBSERVATION } from "@agentxm/extension-materialization";
import { SkillDefinitionInvalid } from "@agentxm/extension-materialization";
import type { RecipeRequirements } from "./operations.js";
import type {
  RegistrySkillRef,
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";

/**
 * The recipes open a real workspace transaction, so every step runs against a
 * throwaway workspace whose transition lock is an in-memory world. Restoration
 * is the transaction's own, not a stub's.
 */
let transactionDir: string;

beforeEach(() => {
  transactionDir = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-recipe-")),
  );
});

afterEach(() => {
  nodeFs.rmSync(transactionDir, { recursive: true, force: true });
});

const grounded = <A, E>(
  effect: Effect.Effect<A, E, RecipeRequirements | ManagerRequirements>,
  writes: RecipeWriteFaults = {},
) =>
  effect.pipe(
    Effect.provide(
      Layer.provideMerge(
        recipeWorkspace(transactionDir, writes),
        Layer.mergeAll(
          WorkspaceTransactionScopeTest({
            workspaceDir: transactionDir,
            settingsPath: nodePath.join(transactionDir, "settings.json"),
            lockPath: nodePath.join(transactionDir, "axm-lock.yaml"),
          }),
          NativeWriteAuthorityPermissive,
          NodeServices.layer,
          FetchHttpClient.layer,
        ),
      ),
    ),
  );

/** What a stub manager observed: these recipes never read the content facts. */
const NO_FACTS: MaterializationFacts = { observation: NO_MATERIALIZATION_OBSERVATION };

const toStepFailure = (failure: CallerStepFailure): StepFailure =>
  failure instanceof SourceAuthorityBlocked
    ? new StepFailure({
        category: "conflict",
        detail: failure.detail,
        suggestions: failure.recovery,
      })
    : new StepFailure({ category: "internal", detail: String(failure) });

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
    location: "file:///workspace/agent_extensions/@acme/skills/review",
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
      isInstalled: () => Effect.succeed(false),
      materializeInstall: () => Effect.succeed(NO_FACTS),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.succeed(NO_FACTS),
      acquireCanonical: () => Effect.succeed(NO_FACTS),
      materializeRetained: () => Effect.succeed(NO_FACTS),
      materializeDeactivate: () => Effect.succeed(NO_FACTS),
      acceptedResolution: () => Effect.succeed(Option.none()),
      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
    const name = extensionName("review");
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      source: {
        type: "registry",
        name: "agentxm",
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
      declaration: { name: ref.skill.name, versionRange: Option.none() },
      toStepFailure,
    });

    expect(operation).toMatchObject({
      readiness: "warn",
      warnMessage: "@acme/skills/review@1.0.0 is yanked",
    });
  });

  it.effect("retains structured deprecation evidence independently from yank warnings", () =>
    Effect.gen(function* () {
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
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
          name: "agentxm",
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
        declaration: { name: ref.skill.name, versionRange: Option.none() },
        toStepFailure,
        buildArtifact: () =>
          Effect.succeed({ path: "agent_extensions/review", scope: "project", change: "created" }),
      });

      expect(operation).toMatchObject({
        readiness: "warn",
        registryLifecycle: { deprecation },
      });
      if (operation.readiness !== "warn") throw new Error("Expected warning-ready install");
      expect(operation.warnMessage).toContain("@acme/skills/review is deprecated");
      expect(operation.warnMessage).toContain("@acme/skills/review@1.0.0 is yanked");
      const result = yield* grounded(operation.run);
      expect(result).toMatchObject({
        result: "success",
        artifact: { registryLifecycle: { deprecation } },
      });
    }),
  );

  it.effect("rejects installing over a workspace source before materialization", () =>
    Effect.gen(function* () {
      const materializeInstall = vi.fn(() => Effect.succeed(NO_FACTS));
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall,
        getConfiguredSource: () => Effect.succeed(Option.some("workspace")),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const name = extensionName("review");
      const ref: RegistrySkillRef = {
        type: "skill",
        refType: "registry",

        publisherBindingId: "hbnd_test",
        source: {
          type: "registry",
          name: "agentxm",
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
        declaration: { name: ref.skill.name, versionRange: Option.none() },
        toStepFailure,
      });
      if (operation.readiness !== "ready") {
        throw new Error("Expected install operation to be ready");
      }
      const result = yield* grounded(operation.run).pipe(
        Effect.match({
          onFailure: (error) => ({ type: "failure", error }) as const,
          onSuccess: () => ({ type: "success" }) as const,
        }),
      );
      if (result.type !== "failure") {
        throw new Error("Expected workspace source protection to reject the install");
      }

      if (result.error._tag !== "StepFailure") throw new Error(result.error._tag);
      expect(result.error.category).toBe("conflict");
      expect(result.error.detail).toContain("Cannot install over workspace-sourced skill");
      expect(result.error.suggestions).toHaveLength(1);
      expect(materializeInstall).not.toHaveBeenCalled();
    }),
  );
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
      location: "file:///workspace/agent_extensions/@acme/skills/review",
      sourceHash: computeSourceHash("review"),
      skill: { name, description: Option.none(), metadata: Option.none() },
    };
  };

  it.effect("preflights materializability before scaffolding", () =>
    Effect.gen(function* () {
      const scaffold = vi.fn(() => Effect.void);
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        listMaterializable: () =>
          Effect.fail(new SkillDefinitionInvalid({ detail: "invalid pack" })),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const step = buildNewExtensionStep(manager, {
        target: { type: "skill", name: "review" },
        ref: workspaceRef(),
        versionRange: Option.none(),
        toStepFailure,
        scaffold: Effect.suspend(scaffold),
        markAuthored: Effect.void,
        message: "Created review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      yield* Effect.flip(grounded(step.run));

      expect(scaffold).not.toHaveBeenCalled();
    }),
  );

  it.effect.each(["scaffold", "mark-authored", "resolve", "materialize", "commit"] as const)(
    "rolls back every authoritative surface when %s fails",
    (failureAt) =>
      Effect.gen(function* () {
        // The surfaces are real files under the transaction's workspace, so
        // the assertion observes the transaction's own restoration rather than
        // a stub's simulation of it.
        const surfacePath = (surface: string) => nodePath.join(transactionDir, surface);
        const write = (surface: string) =>
          Effect.gen(function* () {
            yield* protectWorkspacePath(surfacePath(surface));
            nodeFs.writeFileSync(surfacePath(surface), surface);
          });
        const remove = (surface: string) =>
          Effect.gen(function* () {
            yield* protectWorkspacePath(surfacePath(surface));
            nodeFs.rmSync(surfacePath(surface), { force: true });
          });
        let listCalls = 0;
        const fail = () => Effect.fail(new SkillDefinitionInvalid({ detail: failureAt }));
        const writes: RecipeWriteFaults = {
          removeAccepted: () => remove("lock"),
          removeEntry: () => remove("settings"),
          setEntry: () =>
            Effect.gen(function* () {
              yield* write("settings");
              if (failureAt === "commit") return yield* fail();
            }),
        };
        const manager = {
          type: "skill",
          isInstalled: () => Effect.succeed(false),
          listMaterializable: () => {
            listCalls += 1;
            if (listCalls === 2 && failureAt === "resolve") return fail();
            return Effect.succeed(listCalls === 1 ? [] : [workspaceRef()]);
          },
          materializeInstall: () =>
            Effect.gen(function* () {
              yield* write("projection");
              if (failureAt === "materialize") return yield* fail();
              return NO_FACTS;
            }),
          materializeUninstall: () =>
            Effect.gen(function* () {
              yield* remove("canonical");
              yield* remove("projection");
              return NO_FACTS;
            }),
          acquireCanonical: () => Effect.succeed(NO_FACTS),
          materializeRetained: () => Effect.succeed(NO_FACTS),
          materializeDeactivate: () => Effect.succeed(NO_FACTS),
          acceptedResolution: () => Effect.succeed(Option.none()),
          withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
        } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
        const step = buildNewExtensionStep(manager, {
          target: { type: "skill", name: "review" },
          ref: workspaceRef(),
          versionRange: Option.none(),
          toStepFailure,
          scaffold: Effect.gen(function* () {
            yield* write("canonical");
            if (failureAt === "scaffold") return yield* fail();
          }),
          markAuthored: Effect.gen(function* () {
            yield* write("settings");
            if (failureAt === "mark-authored") return yield* fail();
          }),
          message: "Created review",
        });
        if (step.readiness === "error") throw new Error(step.errorMessage);

        yield* Effect.flip(grounded(step.run, writes));

        expect({
          canonical: nodeFs.existsSync(surfacePath("canonical")),
          settings: nodeFs.existsSync(surfacePath("settings")),
          lock: nodeFs.existsSync(surfacePath("lock")),
          projection: nodeFs.existsSync(surfacePath("projection")),
        }).toEqual({
          canonical: false,
          settings: false,
          lock: false,
          projection: false,
        });
      }),
  );
});

describe("buildAuthoredExtensionStep", () => {
  it.effect("protects additional authored transition files in the workspace transaction", () =>
    Effect.gen(function* () {
      const ref = authoredSkillRef();
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        listMaterializable: () => Effect.succeed([ref]),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const step = buildAuthoredExtensionStep(manager, {
        target: { type: "skill", name: extensionName("review") },
        location: ref.location,
        transactionTargets: ["/workspace/native.json", ref.location],
        versionRange: Option.none(),
        toStepFailure,
        scaffold: Effect.void,
        markAuthored: Effect.void,
        enabled: false,
        message: "Imported review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      yield* grounded(step.run);

      // The authored transition claims both the package location and the
      // additional native file; the transaction snapshots each before writing.
      expect(nodeFs.existsSync(nodePath.join(transactionDir, ".axm-transaction"))).toBe(false);
    }),
  );

  it.effect("permits an explicit configured-source transition without the global preflight", () =>
    Effect.gen(function* () {
      const ref = authoredSkillRef();
      let listCalls = 0;
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        listMaterializable: () => {
          listCalls += 1;
          return listCalls === 1
            ? Effect.succeed([ref])
            : Effect.fail(new SkillDefinitionInvalid({ detail: String("unexpected preflight") }));
        },
        materializeInstall: () => Effect.succeed(NO_FACTS),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const step = buildAuthoredExtensionStep(manager, {
        target: { type: "skill", name: extensionName("review") },
        location: ref.location,
        versionRange: Option.none(),
        toStepFailure,
        scaffold: Effect.void,
        markAuthored: Effect.void,
        allowConfiguredSourceTransition: true,
        message: "Imported review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      yield* grounded(step.run);

      expect(listCalls).toBe(1);
    }),
  );

  it.effect("commits authored desired state but deactivates a disabled target", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const ref = authoredSkillRef();
      const writes: RecipeWriteFaults = {
        setEntry: () => Effect.sync(() => calls.push("settings")),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        listMaterializable: () => Effect.succeed([ref]),
        materializeInstall: () =>
          Effect.sync(() => calls.push("materialize")).pipe(Effect.as(NO_FACTS)),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () =>
          Effect.sync(() => calls.push("deactivate")).pipe(Effect.as(NO_FACTS)),
        acceptedResolution: () =>
          (() => Effect.sync(() => calls.push("resolution-facts")))().pipe(
            Effect.as(Option.none()),
          ),
        getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const step = buildAuthoredExtensionStep(manager, {
        target: { type: "skill", name: extensionName("review") },
        location: ref.location,
        versionRange: Option.none(),
        toStepFailure,
        scaffold: Effect.void,
        markAuthored: Effect.void,
        enabled: false,
        materializeWhenDisabled: true,
        message: "Forked review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      yield* grounded(step.run, writes);

      expect(calls).toEqual(["materialize", "resolution-facts", "settings", "deactivate"]);
    }),
  );

  it.effect("does not touch projections for a disabled authored target by default", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const ref = authoredSkillRef();
      const writes: RecipeWriteFaults = {
        setEntry: () => Effect.sync(() => calls.push("settings")),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        listMaterializable: () => Effect.succeed([ref]),
        materializeInstall: () =>
          Effect.sync(() => calls.push("materialize")).pipe(Effect.as(NO_FACTS)),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () =>
          Effect.sync(() => calls.push("deactivate")).pipe(Effect.as(NO_FACTS)),
        acceptedResolution: () =>
          (() => Effect.sync(() => calls.push("resolution-facts")))().pipe(
            Effect.as(Option.none()),
          ),
        getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const step = buildAuthoredExtensionStep(manager, {
        target: { type: "skill", name: extensionName("review") },
        location: ref.location,
        versionRange: Option.none(),
        toStepFailure,
        scaffold: Effect.void,
        markAuthored: Effect.void,
        enabled: false,
        message: "Imported review",
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);

      yield* grounded(step.run, writes);

      expect(calls).toEqual(["resolution-facts", "settings"]);
    }),
  );
});

describe("buildMaterializeOperation", () => {
  it.effect("derives accepted resolution facts only after materialization succeeds", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () =>
          Effect.sync(() => calls.push("materialize")).pipe(Effect.as(NO_FACTS)),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () =>
          (() => Effect.sync(() => calls.push("resolution-facts")))().pipe(
            Effect.as(Option.none()),
          ),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const name = extensionName("review");
      const ref: RegistrySkillRef = {
        type: "skill",
        refType: "registry",
        publisherBindingId: "hbnd_test",
        source: {
          type: "registry",
          name: "agentxm",
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
      const operation = buildMaterializeOperation(manager, { ref, toStepFailure });
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      yield* grounded(operation.run);

      expect(calls).toEqual(["materialize", "resolution-facts"]);
    }),
  );
});

describe("buildUninstallOperation", () => {
  it.effect.each(["materialize", "settings", "lock", "validate"] as const)(
    "restores all authoritative state when uninstall %s fails",
    (failureAt) =>
      Effect.gen(function* () {
        // The surfaces are real files under the transaction's workspace, so
        // the assertion observes the transaction's own restoration.
        const surfacePath = (surface: string) => nodePath.join(transactionDir, surface);
        for (const surface of ["canonical", "projection", "settings", "lock"]) {
          nodeFs.writeFileSync(surfacePath(surface), surface);
        }
        const present = (surface: string) => nodeFs.existsSync(surfacePath(surface));
        const remove = (surface: string) =>
          Effect.gen(function* () {
            yield* protectWorkspacePath(surfacePath(surface));
            nodeFs.rmSync(surfacePath(surface), { force: true });
          });
        const fail = () => Effect.fail(new SkillDefinitionInvalid({ detail: failureAt }));
        const writes: RecipeWriteFaults = {
          removeAccepted: () =>
            Effect.gen(function* () {
              yield* remove("lock");
              if (failureAt === "lock") return yield* fail();
            }),
          removeEntry: () =>
            Effect.gen(function* () {
              yield* remove("settings");
              if (failureAt === "settings") return yield* fail();
            }),
        };
        const manager = {
          type: "skill",
          isInstalled: () =>
            Effect.succeed(
              failureAt === "validate" ? true : present("canonical") || present("projection"),
            ),
          materializeInstall: () => Effect.succeed(NO_FACTS),
          getConfiguredSource: () =>
            Effect.succeed(
              present("settings") ? Option.some("@acme/skills/review") : Option.none(),
            ),
          listMaterializable: () => Effect.succeed([]),
          materializeUninstall: () =>
            Effect.gen(function* () {
              yield* remove("canonical");
              yield* remove("projection");
              if (failureAt === "materialize") return yield* fail();
              return NO_FACTS;
            }),
          acquireCanonical: () => Effect.succeed(NO_FACTS),
          materializeRetained: () => Effect.succeed(NO_FACTS),
          materializeDeactivate: () => Effect.succeed(NO_FACTS),
          acceptedResolution: () => Effect.succeed(Option.none()),
          withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
        } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
        const operation = buildUninstallOperation<
          SkillExtensionRef,
          MaterializationFacts,
          never,
          ManagerRequirements
        >(
          manager,
          { isRequiredByInstalledPack: () => Effect.succeed(false) },
          { target: { type: "skill", name: "review" }, toStepFailure },
        );
        if (operation.readiness === "error") throw new Error(operation.errorMessage);

        yield* Effect.flip(grounded(operation.run, writes));

        expect({
          canonical: present("canonical"),
          projection: present("projection"),
          settings: present("settings"),
          lock: present("lock"),
        }).toEqual({
          canonical: true,
          projection: true,
          settings: true,
          lock: true,
        });
      }),
  );

  it.effect("reports preserved workspace-authored source after unconfiguring it", () =>
    Effect.gen(function* () {
      const installed = true;
      const materializeUninstall = vi.fn(() => Effect.succeed(NO_FACTS));
      let configured = true;
      const writes: RecipeWriteFaults = {
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(installed),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () =>
          Effect.succeed(configured ? Option.some("workspace") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall,
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        { target: { type: "skill", name: "review" }, toStepFailure },
      );
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      const result = yield* grounded(operation.run, writes);

      expect(materializeUninstall).toHaveBeenCalledWith({
        target: { type: "skill", name: "review" },
      });
      expect(result.message).toBe("Unconfigured review; preserved its workspace-authored source");
    }),
  );

  it.effect("removes only the registration of a target whose package cannot be read", () =>
    Effect.gen(function* () {
      const materializeUninstall = vi.fn(() => Effect.succeed(NO_FACTS));
      let configured = true;
      let locked = true;
      const writes: RecipeWriteFaults = {
        removeAccepted: () =>
          Effect.sync(() => {
            locked = false;
          }),
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        // A target whose manifest is gone still has canonical content on disk.
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () =>
          Effect.succeed(configured ? Option.some("@acme/packs/toolkit") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall,
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        {
          target: { type: "skill", name: "toolkit" },
          toStepFailure,
          retirement: { manifestPath: "packs/toolkit/pack.json", reason: "missing" },
        },
      );
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      const result = yield* grounded(operation.run, writes);

      expect(configured).toBe(false);
      expect(locked).toBe(false);
      // Content AXM cannot verify is never deleted.
      expect(materializeUninstall).not.toHaveBeenCalled();
      expect(result.message).toBe(
        "Unconfigured toolkit; preserved its package because its manifest could not be read",
      );
      if (result.result !== "success") throw new Error(result.message);
      expect(result.warnings).toEqual([
        "toolkit: its package manifest is missing at packs/toolkit/pack.json, so AXM removed its configuration entry and accepted resolution and left its package content in place. Delete that content yourself once you no longer need it.",
      ]);
    }),
  );

  it.effect("distinguishes an undecodable package manifest from a missing one", () =>
    Effect.gen(function* () {
      let configured = true;
      const writes: RecipeWriteFaults = {
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () =>
          Effect.succeed(configured ? Option.some("@acme/packs/toolkit") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        {
          target: { type: "skill", name: "toolkit" },
          toStepFailure,
          retirement: { manifestPath: "packs/toolkit/pack.json", reason: "invalid" },
        },
      );
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      const result = yield* grounded(operation.run, writes);

      if (result.result !== "success") throw new Error(result.message);
      expect(result.warnings?.[0]).toContain("cannot be read at packs/toolkit/pack.json");
    }),
  );

  it.effect("removes configured projections without canonical artifacts", () =>
    Effect.gen(function* () {
      let configured = true;
      let projected = true;
      const materializeUninstall = vi.fn(() =>
        Effect.sync(() => {
          projected = false;
        }).pipe(Effect.as(NO_FACTS)),
      );
      const writes: RecipeWriteFaults = {
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () =>
          Effect.succeed(configured ? Option.some("workspace:@acme/skills/review") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall,
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        { target: { type: "skill", name: "review" }, toStepFailure },
      );
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      yield* grounded(operation.run, writes);

      expect(materializeUninstall).toHaveBeenCalledWith({
        target: { type: "skill", name: "review" },
      });
      expect(projected).toBe(false);
      expect(configured).toBe(false);
    }),
  );

  it.effect("removes a source-free configured extension without canonical artifacts", () =>
    Effect.gen(function* () {
      let configured = true;
      const materializeUninstall = vi.fn(() => Effect.succeed(NO_FACTS));
      const writes: RecipeWriteFaults = {
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(false),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () => Effect.succeed(Option.none()),
        isConfigured: () => Effect.succeed(configured),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall,
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(false) },
        { target: { type: "skill", name: "review" }, toStepFailure },
      );
      if (operation.readiness === "error") throw new Error(operation.errorMessage);

      yield* grounded(operation.run, writes);

      expect(materializeUninstall).toHaveBeenCalledWith({
        target: { type: "skill", name: "review" },
      });
      expect(configured).toBe(false);
    }),
  );

  it.effect(
    "does not turn an orphan accepted resolution into installed state during uninstall",
    () =>
      Effect.gen(function* () {
        const removeLockfileEntry = vi.fn(() => Effect.void);
        const writes: RecipeWriteFaults = { removeAccepted: removeLockfileEntry };
        const manager = {
          type: "skill",
          isInstalled: () => Effect.succeed(false),
          materializeInstall: () => Effect.succeed(NO_FACTS),
          getConfiguredSource: () => Effect.succeed(Option.none()),
          listMaterializable: () => Effect.succeed([]),
          materializeUninstall: () => Effect.succeed(NO_FACTS),
          acquireCanonical: () => Effect.succeed(NO_FACTS),
          materializeRetained: () => Effect.succeed(NO_FACTS),
          materializeDeactivate: () => Effect.succeed(NO_FACTS),
          acceptedResolution: () => Effect.succeed(Option.none()),
          withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
        } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
        const operation = buildUninstallOperation<
          SkillExtensionRef,
          MaterializationFacts,
          never,
          ManagerRequirements
        >(
          manager,
          { isRequiredByInstalledPack: () => Effect.succeed(false) },
          { target: { type: "skill", name: "review" }, toStepFailure },
        );
        if (operation.readiness === "error") {
          throw new Error(operation.errorMessage);
        }

        const result = yield* grounded(operation.run, writes);

        expect(removeLockfileEntry).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          disposition: "unchanged",
          message: "review is already absent",
        });
      }),
  );

  it.effect("preserves an accepted resolution while a desired pack retains the extension", () =>
    Effect.gen(function* () {
      const removeLockfileEntry = vi.fn(() => Effect.void);
      let configured = true;
      const writes: RecipeWriteFaults = {
        removeAccepted: removeLockfileEntry,
        removeEntry: () =>
          Effect.sync(() => {
            configured = false;
          }),
      };
      const manager = {
        type: "skill",
        isInstalled: () => Effect.succeed(true),
        materializeInstall: () => Effect.succeed(NO_FACTS),
        getConfiguredSource: () =>
          Effect.succeed(configured ? Option.some("@acme/skills/review") : Option.none()),
        listMaterializable: () => Effect.succeed([]),
        materializeUninstall: () => Effect.succeed(NO_FACTS),
        acquireCanonical: () => Effect.succeed(NO_FACTS),
        materializeRetained: () => Effect.succeed(NO_FACTS),
        materializeDeactivate: () => Effect.succeed(NO_FACTS),
        acceptedResolution: () => Effect.succeed(Option.none()),
        withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
      } satisfies ExtensionManager<SkillExtensionRef, MaterializationFacts, ManagerRequirements>;
      const operation = buildUninstallOperation<
        SkillExtensionRef,
        MaterializationFacts,
        never,
        ManagerRequirements
      >(
        manager,
        { isRequiredByInstalledPack: () => Effect.succeed(true) },
        { target: { type: "skill", name: "review" }, toStepFailure },
      );
      if (operation.readiness === "error") {
        throw new Error(operation.errorMessage);
      }

      yield* grounded(operation.run, writes);

      expect(removeLockfileEntry).not.toHaveBeenCalled();
    }),
  );
});
