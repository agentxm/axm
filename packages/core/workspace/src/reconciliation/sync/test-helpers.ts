/**
 * Driving reconciliation from this package's own tests and specifications.
 *
 * A reconciliation is only observable over a real workspace: it reads settings
 * and the lockfile, materializes canonical content from real sources, and
 * writes agent-native projections through the real per-type managers. So the
 * fixture here is a throwaway project directory with the production layers
 * composed over it, plus the deterministic ports the plan pipeline needs —
 * the same shape every other feature package's fixture takes.
 *
 * It is excluded from the library build and from the published files: nothing
 * in production source imports it.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { ReleaseAgePosture } from "../../resolution/index.js";
import { previewPlanExecution, type PlanExecution } from "../../transitions/planning/index.js";
import {
  ResolvePlanInteractionTest,
  preapprovedPlanExecution,
  type ResolvePlanInteractionTestState,
} from "../../transitions/planning/testing.js";
import {
  makeWorkspaceWorld,
  withAllManagers,
  withLiveSources,
} from "../../testing/workspace-world.js";
import { makeFileRegistry, type FileRegistry } from "@agentxm/registry-client/testing";

import { SyncStepFailureConversionTest } from "./testing.js";
import { SyncWorkspace, type SyncWorkspaceCandidate } from "./sync-workspace.js";
import { syncRequest } from "./testing.js";
import type { SyncWorkspaceRequest } from "./sync-workspace.js";

export { syncRequest };
export { makeFileRegistry, type FileRegistry };

export interface SyncFixtureOptions {
  readonly scope?: WorkspaceScope;
  /** Settings document for the selected scope; written as authored. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Lockfile document for the selected scope; `lockfileVersion` is supplied. */
  readonly lockfile?: Readonly<Record<string, unknown>>;
  /** Extra files written into the project root, keyed by relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Agent executables the machine reports as present. */
  readonly installedExecutables?: ReadonlyArray<string>;
  /**
   * The transport the workspace's Registry client factory binds. The factory
   * captures its transport when the layer is built, so a test that controls
   * Registry responses supplies the port here rather than providing an HTTP
   * client to the program afterwards. Absent, every request is refused.
   */
  readonly httpClient?: HttpClient.HttpClient;
}

/**
 * A throwaway workspace with every service a reconciliation needs over it,
 * and a pinned user home so a project-scope sweep can be shown to leave the
 * user scope alone.
 */
export const makeSyncFixture = (options: SyncFixtureOptions = {}) => {
  const interaction = ResolvePlanInteractionTest();
  const world = makeWorkspaceWorld({
    prefix: "axm-sync-",
    scope: options.scope,
    settings: options.settings,
    lockfile: options.lockfile,
    files: options.files,
    installedExecutables: options.installedExecutables,
    httpClient:
      options.httpClient === undefined
        ? undefined
        : Layer.succeed(HttpClient.HttpClient, options.httpClient),
    ports: Layer.mergeAll(
      interaction.layer,
      SyncStepFailureConversionTest,
      Layer.succeed(ReleaseAgePosture, "enforce"),
    ),
  });
  const services = withAllManagers(withLiveSources(world.projection, "0.0.0-fixture"));
  const {
    root,
    home,
    workspaceRoot,
    writeFile,
    writeSettings,
    readFile,
    exists,
    remove,
    readSettings,
    snapshot,
    homeSnapshot,
    cleanup,
  } = world;

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    writeSettings,
    readFile,
    exists,
    remove,
    /** The settings document, as the product wrote it. */
    readSettings,
    /** Every file under the project root. */
    snapshot,
    /** Every file under the pinned user home. */
    homeSnapshot,
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup,
  };
};

export type SyncFixture = ReturnType<typeof makeSyncFixture>;

/**
 * What a reconciliation settled to: an operation that was previewed or
 * applied, or the settled fact that the workspace already matched what it
 * declares.
 */
export type SyncOutcome =
  | {
      readonly _tag: "Resolved";
      readonly resolution: Effect.Success<ReturnType<typeof SyncWorkspace.previewOrApply>>;
    }
  | { readonly _tag: "AlreadyReconciled"; readonly message: string };

const resolveSync = (request: SyncWorkspaceRequest, execution: PlanExecution) =>
  Effect.gen(function* () {
    const candidate = yield* SyncWorkspace.prepare(request);
    if (candidate._tag === "AlreadyReconciled") {
      return { _tag: "AlreadyReconciled", message: candidate.message } satisfies SyncOutcome;
    }
    const settled: SyncWorkspaceCandidate = candidate;
    return {
      _tag: "Resolved",
      resolution: yield* SyncWorkspace.previewOrApply(settled, execution),
    } satisfies SyncOutcome;
  });

/** Settle a reconciliation and preview it: nothing is written. */
export const previewSync = (request: SyncWorkspaceRequest = syncRequest()) =>
  resolveSync(request, previewPlanExecution);

/** Settle a reconciliation and apply it. */
export const applySync = (request: SyncWorkspaceRequest = syncRequest()) =>
  resolveSync(request, preapprovedPlanExecution);

/** The resolution an example expected a reconciliation to produce. */
export const expectResolved = (
  outcome: SyncOutcome,
): Effect.Success<ReturnType<typeof SyncWorkspace.previewOrApply>> => {
  if (outcome._tag !== "Resolved") {
    throw new Error(
      `Expected the reconciliation to resolve an operation, but the workspace was already reconciled: ${outcome.message}`,
    );
  }
  return outcome.resolution;
};

// -----------------------------------------------------------------------------
// Package fixtures
// -----------------------------------------------------------------------------

const writePackageFile = (packageRoot: string, relative: string, contents: string): void => {
  const file = nodePath.join(packageRoot, relative);
  fs.mkdirSync(nodePath.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

/** A local skill package under `<root>/vendor/<name>`, as the product writes one. */
export const writeLocalSkillPackage = (
  root: string,
  fixture: { readonly name: string; readonly description?: string; readonly version?: string },
): string => {
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  const packageRoot = nodePath.join(root, "vendor", fixture.name);
  writePackageFile(
    packageRoot,
    "skill.json",
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: "@acme",
        type: "skill",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description,
      },
      null,
      2,
    )}\n`,
  );
  writePackageFile(
    packageRoot,
    "src/SKILL.md",
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${description}\n`,
  );
  return packageRoot;
};

/** A workspace-authored rule package under `<root>/rules/<name>`. */
export const writeAuthoredRule = (root: string, name: string, body: string): void => {
  const packageRoot = nodePath.join(root, "rules", name);
  writePackageFile(
    packageRoot,
    "rule.json",
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/rule.schema.json",
      owner: "@acme",
      type: "rule",
      name,
      version: "1.0.0",
      description: `Guidance for ${name}.`,
    })}\n`,
  );
  writePackageFile(packageRoot, "src/RULE.md", `${body}\n`);
};

/** A workspace-authored Knowledge bundle under `<root>/knowledge/<name>`. */
export const writeAuthoredKnowledge = (root: string, name: string, description: string): void => {
  const packageRoot = nodePath.join(root, "knowledge", name);
  writePackageFile(
    packageRoot,
    "knowledge.json",
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/knowledge.schema.json",
      owner: "@acme",
      type: "knowledge",
      name,
      version: "1.0.0",
      description,
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    })}\n`,
  );
  writePackageFile(
    packageRoot,
    "src/index.md",
    `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${name}\n`,
  );
};
