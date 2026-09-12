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
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { AgentExecutableResolver } from "@agentxm/agent-integration";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  ExtensionManagersLive,
  HookManagerLive,
  KnowledgeManagerLive,
  McpSecretStoreLive,
  McpServerManagerLive,
  PackManagerLive,
  ProjectionParticipantsLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "@agentxm/extension-materialization/live";
import {
  ReleaseAgePosture,
  decideNamedRegistryVersion,
  namedRegistryCandidates,
  resolveVersionEntryWithReleaseAge,
} from "@agentxm/extension-resolution";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { AxmSkillCandidateGateLive } from "@agentxm/extension-resolution/live";
import { RegistryResolutionPolicy } from "@agentxm/extension-sources";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { previewPlanExecution, type PlanExecution } from "@agentxm/workspace-operations";
import {
  ResolvePlanInteractionTest,
  preapprovedPlanExecution,
  type ResolvePlanInteractionTestState,
} from "@agentxm/workspace-operations/testing";
import { PlanInvocationTest } from "@agentxm/workspace-operations/testing";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
  WorkspaceInvariantFactsLive,
} from "@agentxm/workspace-projection/live";
import { layer as WorkspaceLayerLive } from "@agentxm/workspace-state/live";
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
}

/**
 * A throwaway workspace with every service a reconciliation needs over it,
 * and a pinned user home so a project-scope sweep can be shown to leave the
 * user scope alone.
 */
export const makeSyncFixture = (options: SyncFixtureOptions = {}) => {
  const scope = options.scope ?? "project";
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-sync-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-sync-home-")));
  const workspaceRoot = scope === "user" ? nodePath.join(home, ".axm", "workspace") : root;
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });

  const writeFile = (relativePath: string, contents: string): void => {
    const file = nodePath.join(root, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const readFile = (relativePath: string): string =>
    fs.readFileSync(nodePath.join(root, relativePath), "utf8");
  const exists = (relativePath: string): boolean =>
    fs.existsSync(nodePath.join(root, relativePath));
  const remove = (relativePath: string): void => {
    fs.rmSync(nodePath.join(root, relativePath), { recursive: true, force: true });
  };

  /** Every file, symlink, and directory under a root, so purity can be proven. */
  const snapshotUnder = (base: string): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(base, absolute);
        if (entry.isSymbolicLink()) {
          entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
          continue;
        }
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(absolute);
          continue;
        }
        entries.push([relative, fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(base);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  const writeSettings = (settings: Readonly<Record<string, unknown>>): void => {
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm.json"),
      `${JSON.stringify({ agents: [], ...settings }, null, 2)}\n`,
    );
  };

  if (options.settings !== undefined) {
    writeSettings(options.settings);
    // JSON is valid YAML, so the lockfile fixture needs no emitter.
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm-lock.yaml"),
      JSON.stringify({ lockfileVersion: 7, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }

  const interaction = ResolvePlanInteractionTest();
  const environment = ConfigProvider.layer(
    ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } }),
  );
  const transport = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("no HTTP request in this fixture")),
  );
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const executables = Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
  });

  // One environment, built outward: the workspace state and the ports over it,
  // then the projection services that read them, then the managers that read
  // both, then the registry that indexes the managers.
  const base = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceLayerLive({
        scope,
        projectRoot: decodeAbsolutePathSync(root),
        allowUninitialized: options.settings === undefined,
      }),
      CodingAgentRepositoryLive,
      NativeWriteAuthorityLive,
      transport,
      interaction.layer,
      executables,
      SyncStepFailureConversionTest,
      Layer.succeed(ReleaseAgePosture, "enforce"),
      PlanInvocationTest,
    ),
    environment,
  );
  const withProjection = Layer.provideMerge(WorkspaceCatalogLive, base);
  // Reconciliation acquires from real sources, so the production resolution
  // layer composes over the same workspace catalog.
  const liveSourceProviders = Layer.provide(
    SourceHostProvidersLive,
    Layer.mergeAll(
      withProjection,
      Layer.provide(
        AxmSkillCandidateGateLive,
        makeAxmSkillCompatibilityPolicyLayer("0.0.0-fixture"),
      ),
      Layer.succeed(RegistryResolutionPolicy, {
        selectVersion: resolveVersionEntryWithReleaseAge,
        decideNamedVersion: decideNamedRegistryVersion,
        namedCandidates: namedRegistryCandidates,
      }),
    ),
  );
  const withSources = Layer.provideMerge(liveSourceProviders, withProjection);
  const leafManagers = Layer.provideMerge(
    Layer.mergeAll(
      RuleManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      SkillManagerLive,
      SubagentManagerLive,
      McpSecretStoreLive,
    ),
    withSources,
  );
  const withMcp = Layer.provideMerge(McpServerManagerLive, leafManagers);
  const withPack = Layer.provideMerge(PackManagerLive, withMcp);
  const withParticipants = Layer.provideMerge(ProjectionParticipantsLive, withPack);
  const services = Layer.provideMerge(
    Layer.mergeAll(ExtensionManagersLive, WorkspaceInvariantFactsLive),
    withParticipants,
  );

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
    readSettings: (): Readonly<Record<string, unknown>> => {
      const parsed: unknown = JSON.parse(readFile("axm.json"));
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Expected the workspace settings document to be an object");
      }
      return { ...parsed };
    },
    /** Every file under the project root. */
    snapshot: () => snapshotUnder(root),
    /** Every file under the pinned user home. */
    homeSnapshot: () => snapshotUnder(home),
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
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
