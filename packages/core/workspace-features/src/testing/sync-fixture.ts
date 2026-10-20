/**
 * Driving reconciliation from the features' tests and specifications.
 *
 * A reconciliation is only observable over a real workspace: it reads settings
 * and the lockfile, materializes canonical content from real sources, and
 * writes agent-native projections through the real per-type managers. So the
 * fixture here is a throwaway project directory with the production layers
 * composed over it, plus the deterministic ports the plan pipeline needs —
 * the same shape every other feature's fixture takes.
 *
 * Only test-purpose files import it; nothing in production source does.
 */

import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { DEFAULT_AUTHORED_DIRECTORIES } from "@agentxm/workspace-kernel/workspace-state";
import { previewPlanExecution, type PlanExecution } from "@agentxm/workspace-kernel/operations";
import {
  ResolvePlanInteractionTest,
  preapprovedPlanExecution,
  type ResolvePlanInteractionTestState,
} from "@agentxm/workspace-kernel/planning/testing";
import { writeMinimalPackage } from "./local-packages.js";
import { makeWorkspaceWorld, withAllManagers, withLiveSources } from "./workspace-world.js";
import { makeFileRegistry, type FileRegistry } from "@agentxm/registry-client/testing";

import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import {
  SyncWorkspace,
  type SyncWorkspaceCandidate,
  type SyncWorkspaceRequest,
} from "../sync/index.js";
import { syncRequest } from "../sync/testing.js";
import { UninstallExtensions } from "../lifecycle/index.js";

export { syncRequest };
export { makeFileRegistry, type FileRegistry };

export interface SyncFixtureOptions {
  /** Borrow one coordinator for related workspaces; the supplying fixture owns cleanup. */
  readonly boundaryClaimsDirectory?: string | undefined;
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
  /** Wrap the pinned-home configuration provider before workspace capture. */
  readonly configureConfigProvider?: (
    provider: ConfigProvider.ConfigProvider,
  ) => ConfigProvider.ConfigProvider;
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
    boundaryClaimsDirectory: options.boundaryClaimsDirectory,
    settings: options.settings,
    lockfile: options.lockfile,
    files: options.files,
    installedExecutables: options.installedExecutables,
    configureConfigProvider: options.configureConfigProvider,
    httpClient:
      options.httpClient === undefined
        ? undefined
        : Layer.succeed(HttpClient.HttpClient, options.httpClient),
    ports: Layer.mergeAll(
      interaction.layer,
      StepFailureConversionTest,
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
    boundaryClaimsDirectory: world.boundaryClaimsDirectory,
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

/** Withdraw an MCP declaration with its pre-withdrawal ownership still available. */
export const withdrawMcpServer = (name: string) =>
  Effect.gen(function* () {
    const candidate = yield* UninstallExtensions.prepare({
      type: Option.some("mcp-server"),
      selector: name,
    });
    return yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
  });

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

/** A workspace-authored rule package under its authored directory, with `body` as its guidance. */
export const writeAuthoredRule = (root: string, name: string, body: string): void => {
  writeMinimalPackage(nodePath.join(root, DEFAULT_AUTHORED_DIRECTORIES.rule, name), "rule", {
    name,
    body,
  });
};

/** A workspace-authored Knowledge bundle under its authored directory. */
export const writeAuthoredKnowledge = (root: string, name: string, description: string): void => {
  writeMinimalPackage(
    nodePath.join(root, DEFAULT_AUTHORED_DIRECTORIES.knowledge, name),
    "knowledge",
    { name, description },
  );
};
