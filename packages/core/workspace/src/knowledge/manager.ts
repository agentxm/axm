import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import { usableAcceptedCanonical } from "../desired-state/index.js";

// @effect-diagnostics anyUnknownInErrorContext:off — schema and filesystem errors are swept into KnowledgeIoFailed inside this manager
/** Lifecycle manager for isolated Open Knowledge Format bundles. */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../desired-state/index.js";

import { stripFileProtocol } from "@agentxm/registry-client";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Result from "effect/Result";
import { PlatformError } from "effect/PlatformError";
import {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "./errors.js";
import { acceptedResolutionFor } from "../materialization/accepted-resolution.js";
import {
  applyProjectionPlans,
  formatProjectionExclusions,
  planAggregateProjection,
  type ProjectionContributorExclusion,
  type ProjectionPlan,
  type ProjectionSelection,
  requireCompleteGraph,
  KNOWLEDGE_REGION_OWNER,
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryBundle,
  resolveInstructionsConfig,
} from "../projection/index.js";
import {
  reusableCanonicalTree,
  materializeExternalPackage,
} from "../acquisition/canonical-directory.js";
import { materializeRegistryPackage } from "../materialization/registry-materialization.js";
import {
  computeExtensionPathsForLayout,
  observeCanonicalExtension,
  type DesiredExtensionNode,
} from "../desired-state/index.js";
import { canonicalObservationFactText } from "../projection/canonical-observation-fact.js";
import { computePackageContentHash } from "../desired-state/index.js";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "../desired-state/index.js";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { KnowledgeLockEntry } from "../desired-state/index.js";
import { SourceHostProviders, WorkspaceCatalog } from "../resolution/sources/index.js";
import { acquiredDirectoryForRef } from "../acquisition/acquired-content.js";
import type { KnowledgeMap } from "../desired-state/index.js";
import { knowledgeLockEntryToRef } from "../desired-state/index.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { recordFootprint } from "../transitions/settlement/index.js";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import { usableAcceptedCanonicalRef } from "../desired-state/index.js";
import type { ManagerRequirements } from "../materialization/manager-contract.js";
import { NO_MATERIALIZATION_OBSERVATION } from "../materialization/manager-contract.js";
import type { KnowledgeMaterializationFacts } from "../materialization/managers.js";
import type { ExtensionManagerFailure } from "../materialization/errors.js";
import {
  KnowledgeManager,
  type KnowledgeManagerService,
  type KnowledgeSyncResult,
} from "../materialization/managers.js";
import type { ExtensionTarget } from "../desired-state/index.js";
import { runWorkspaceTransaction } from "../transitions/settlement/index.js";
import { isObservedInstalled } from "../desired-state/index.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../desired-state/index.js";
import { protectWorkspacePath } from "../transitions/settlement/index.js";
import { isSourcedDesiredExtension, type DesiredStateGraph } from "../desired-state/index.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "../desired-state/index.js";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import {
  inspectKnowledgeBundle,
  type KnowledgeInspection,
} from "@agentxm/extension-content/knowledge";
import { resolveKnowledgeInstructionEntry } from "../projection/index.js";
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

interface PreparedKnowledgePackage {
  readonly root: string;
  readonly sourceHash: SourceHash;
  readonly treeIntegrity?: TreeIntegrity;
  readonly commit: Effect.Effect<void, ExtensionManagerFailure>;
  readonly rollback: Effect.Effect<void, ExtensionManagerFailure>;
}

const decodeManifest = Schema.decodeUnknownEffect(KnowledgeManifestSchema);

/**
 * Name the failure that stopped a restore in the operator's sentence: the
 * producing family carries its own detail, so no application envelope is
 * needed to describe it.
 */
const describeKnowledgeFailure = (failure: { readonly _tag: string }): string =>
  "detail" in failure && typeof failure.detail === "string" ? failure.detail : failure._tag;

export const KnowledgeManagerLive = Layer.effect(
  KnowledgeManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const catalog = yield* WorkspaceCatalog;
    const baseDir = location.baseDir;

    // The workspace state ports and source integration are this layer's own
    // dependencies; the platform stays in `R` for every member.
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(WorkspaceLocation, location),
        Effect.provideService(SettingsReader, settings),
        Effect.provideService(LockfileReader, lockfile),
        Effect.provideService(DesiredStateReader, desiredState),
        Effect.provideService(WorkspaceRecords, records),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(WorkspaceCatalog, catalog),
      );

    const acquiredFacts = (
      prepared: {
        readonly sourceHash: SourceHash;
        readonly treeIntegrity?: TreeIntegrity;
      },
      workspaceRelativeLocalSourcePath: Option.Option<string>,
    ): KnowledgeMaterializationFacts => ({
      observation: NO_MATERIALIZATION_OBSERVATION,
      acquired: Option.some({
        workspaceRelativeLocalSourcePath,
        sourceHash: prepared.sourceHash,
        ...(prepared.treeIntegrity === undefined ? {} : { treeIntegrity: prepared.treeIntegrity }),
      }),
    });
    const withdrawn: KnowledgeMaterializationFacts = {
      observation: NO_MATERIALIZATION_OBSERVATION,
      acquired: Option.none(),
    };

    const canonicalPathForRef = (ref: KnowledgeExtensionRef): string =>
      computeExtensionPathsForLayout(
        path.join,
        currentLayout(),
        ref,
        KNOWLEDGE_EXTENSION_DIR,
        ref.name,
      ).canonicalPath;

    const materializePackage = (
      ref: KnowledgeExtensionRef,
      options?: {
        readonly baseDir?: string;
        readonly destinationPath?: string;
      },
    ) => {
      const canonicalPath = options?.destinationPath ?? canonicalPathForRef(ref);
      const materializationBaseDir = options?.baseDir ?? baseDir;
      switch (ref.refType) {
        case "registry":
          return Effect.gen(function* () {
            return yield* provide(
              materializeRegistryPackage({
                baseDir: materializationBaseDir,
                destinationPath: canonicalPath,
                sourceLocation: ref.source.location,
                owner: ref.owner,
                type: "knowledge",
                name: ref.name,
                version: ref.version,
                integrity: ref.integrity,
                publisherBindingId: ref.publisherBindingId,
                ...(ref.lifecycleWarnings === undefined
                  ? {}
                  : { lifecycleWarnings: ref.lifecycleWarnings }),
                messages: {
                  integrityMismatchDetail: `Integrity mismatch for knowledge:${ref.name}@${ref.version}`,
                },
              }),
            );
          });
        case "git-hosted":
        case "local":
          return Effect.flatMap(acquiredDirectoryForRef(ref, ref.location), (sourceLocation) =>
            provide(
              materializeExternalPackage({
                baseDir: materializationBaseDir,
                canonicalPath,
                sourceLocation,
                copyFailureCode: "validation",
                copyFailureDetail: (target) => `Failed to copy knowledge package to ${target}`,
              }),
            ),
          );
        case "workspace":
          if (
            ref.scope !== location.scope ||
            path.resolve(ref.location) !== path.resolve(canonicalPath)
          ) {
            return Effect.fail(
              new KnowledgeDefinitionInvalid({
                detail: `Invalid workspace knowledge source location: ${ref.location}`,
              }),
            );
          }
          return Effect.succeed(ref.location);
      }
    };

    const inspectPackage = (packageRoot: string) =>
      Effect.gen(function* () {
        const raw = yield* fs
          .readFileString(path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME))
          .pipe(
            Effect.mapError(
              (cause) =>
                new KnowledgeDefinitionInvalid({
                  detail: `Failed to read ${KNOWLEDGE_MANIFEST_FILENAME}`,
                  cause,
                }),
            ),
          );
        const manifest = yield* Effect.try({
          try: (): unknown => JSON.parse(raw),
          catch: (cause) =>
            new KnowledgeDefinitionInvalid({
              detail: `Failed to parse ${KNOWLEDGE_MANIFEST_FILENAME}`,
              cause,
            }),
        }).pipe(
          Effect.flatMap(decodeManifest),
          Effect.mapError(
            (cause) =>
              new KnowledgeDefinitionInvalid({
                detail: `Invalid ${KNOWLEDGE_MANIFEST_FILENAME}`,
                cause,
              }),
          ),
        );
        const inspection = yield* provide(
          inspectKnowledgeBundle(path.join(packageRoot, KNOWLEDGE_SOURCE_DIR)),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new KnowledgeDefinitionInvalid({
                detail: "Failed to inspect Open Knowledge Format bundle",
                cause,
              }),
          ),
        );
        const errors = inspection.diagnostics.filter((item) => item.severity === "error");
        if (errors.length > 0) {
          return yield* new KnowledgeDefinitionInvalid({
            detail: errors
              .map((item) =>
                item.details?.kind === "frontmatter-parse"
                  ? `${item.relativePath}: ${item.message}`
                  : item.message,
              )
              .join(" "),
          });
        }
        return { manifest, inspection };
      });

    const preparePackage = (
      ref: KnowledgeExtensionRef,
      force = false,
    ): Effect.Effect<
      PreparedKnowledgePackage,
      ExtensionManagerFailure,
      ManagerRequirements | Scope.Scope
    > =>
      Effect.gen(function* () {
        const canonicalPath = canonicalPathForRef(ref);
        if (ref.refType === "workspace") {
          const root = yield* materializePackage(ref);
          yield* inspectPackage(root);
          return {
            root,
            sourceHash: ref.sourceHash,
            commit: Effect.void,
            rollback: Effect.void,
          };
        }
        // Decide against the canonical tree before staging: the staged path
        // never exists, so a decision made there would re-extract every time
        // and revert workspace-owned content on a no-op install.
        if (ref.refType === "registry") {
          const reusable = yield* provide(
            reusableCanonicalTree({
              canonicalPath,
              requested: {
                refType: "registry",
                owner: ref.owner,
                name: ref.name,
                version: ref.version,
                publisherBindingId: ref.publisherBindingId,
              },
              accepted: yield* lockfile.entry("knowledge", ref.knowledge.name),
              force,
            }),
          );
          if (Option.isSome(reusable)) {
            return {
              root: canonicalPath,
              sourceHash: yield* provide(computePackageContentHash(canonicalPath)),
              treeIntegrity: reusable.value,
              commit: Effect.void,
              rollback: Effect.void,
            };
          }
        }
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-knowledge-package-" });
        const stagedPath = path.join(tempDir, "staged");
        const backupPath = path.join(tempDir, "previous");
        const stageState = yield* Ref.make<
          | { readonly phase: "preparing" }
          | { readonly phase: "staged"; readonly hadCanonical: boolean }
          | { readonly phase: "settled" }
        >({ phase: "preparing" });
        const restoreStagedPackage = Ref.get(stageState).pipe(
          Effect.flatMap((state) => {
            if (state.phase !== "staged") return Effect.void;
            return fs.remove(canonicalPath, { recursive: true, force: true }).pipe(
              Effect.mapError(
                (cause) =>
                  new KnowledgeIoFailed({
                    detail: `Failed to remove staged Knowledge package during rollback: ${canonicalPath}`,
                    cause,
                  }),
              ),
              Effect.andThen(
                state.hadCanonical
                  ? fs.rename(backupPath, canonicalPath).pipe(
                      Effect.mapError(
                        (cause) =>
                          new KnowledgeIoFailed({
                            detail: `Failed to restore Knowledge package during rollback: ${canonicalPath}`,
                            cause,
                          }),
                      ),
                    )
                  : Effect.void,
              ),
              Effect.andThen(Ref.set(stageState, { phase: "settled" })),
            );
          }),
        );
        yield* Effect.addFinalizer(() =>
          restoreStagedPackage.pipe(
            Effect.catchCause((cause) =>
              Effect.logError(
                "Failed to restore staged Knowledge package during finalization",
                cause,
              ),
            ),
          ),
        );
        const stagedRoot = yield* materializePackage(ref, {
          baseDir: tempDir,
          destinationPath: stagedPath,
        });
        yield* inspectPackage(stagedRoot);
        const sourceHash = yield* provide(computePackageContentHash(stagedRoot));
        const treeIntegrity = yield* provide(computeMaterializedTreeIntegrity(stagedRoot));
        yield* protectWorkspacePath(canonicalPath);
        const hadCanonical = yield* fs.exists(canonicalPath);
        // The footprint reports byte changes: replacing a tree with an
        // identical one is not one, however it was acquired.
        const previousTreeIntegrity = hadCanonical
          ? yield* provide(computeMaterializedTreeIntegrity(canonicalPath)).pipe(Effect.option)
          : Option.none<TreeIntegrity>();
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            if (hadCanonical) yield* fs.rename(canonicalPath, backupPath);
            yield* fs.makeDirectory(path.dirname(canonicalPath), { recursive: true });
            yield* fs.rename(stagedPath, canonicalPath).pipe(
              Effect.tapError(() =>
                hadCanonical
                  ? fs.rename(backupPath, canonicalPath).pipe(
                      Effect.mapError(
                        (cause) =>
                          new KnowledgeIoFailed({
                            detail: `Failed to restore Knowledge package after staging failed: ${canonicalPath}`,
                            cause,
                          }),
                      ),
                    )
                  : Effect.void,
              ),
            );
            yield* Ref.set(stageState, { phase: "staged", hadCanonical });
          }),
        );
        if (!Option.contains(previousTreeIntegrity, treeIntegrity)) {
          yield* recordFootprint({
            path: canonicalPath,
            change: hadCanonical ? "modified" : "created",
          });
        }
        return {
          root: canonicalPath,
          sourceHash,
          treeIntegrity,
          commit: Ref.set(stageState, { phase: "settled" }),
          rollback: restoreStagedPackage,
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof PlatformError
            ? new KnowledgeIoFailed({
                detail: `Failed to stage Knowledge bundle ${ref.knowledge.name}`,
                cause,
              })
            : cause,
        ),
      );

    const getInstructionsTarget = () =>
      Effect.gen(function* () {
        const config = yield* settings.instructionsConfig;
        const enabled = Option.isSome(config) && config.value !== false;
        const resolved = resolveInstructionsConfig(enabled ? config.value : undefined);
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* new KnowledgeDefinitionInvalid({
            detail: `Knowledge discovery instruction target escapes workspace: ${resolved.fileName}`,
          });
        }
        return {
          path: path.resolve(baseDir, relative.value),
          enabled,
          preserveSource: enabled,
        };
      });

    /**
     * The canonical observation of one desired Knowledge node: the only
     * judge of whether its accepted content may serve as discovery input.
     */
    const observeDesiredKnowledge = (
      node: DesiredExtensionNode,
      locked: KnowledgeLockEntry | undefined,
    ) =>
      provide(
        observeCanonicalExtension({ layout: currentLayout(), desired: node, accepted: locked }),
      );

    const toProjectionBundle = (
      root: string,
      inspected: {
        readonly manifest: KnowledgeManifest;
        readonly inspection: KnowledgeInspection;
      },
    ): KnowledgeDiscoveryBundle => ({
      owner: inspected.manifest.owner,
      name: inspected.manifest.name,
      sourceDir: path.join(root, KNOWLEDGE_SOURCE_DIR),
      ...(inspected.manifest.description === undefined
        ? {}
        : { description: inspected.manifest.description }),
    });

    const activeKnowledgeNodes = () =>
      desiredState
        .graph()
        .pipe(
          Effect.flatMap((graph) =>
            graph.complete
              ? Effect.succeed(
                  graph.nodes
                    .filter(isSourcedDesiredExtension)
                    .filter((node) => node.type === "knowledge" && node.enabled),
                )
              : new KnowledgeDesiredStateUnreconcilable(),
          ),
        );

    /**
     * Classify a bundle whose package could not be inspected. Only the
     * bundle's own content is in question here: resolution facts have already
     * succeeded, so the two truthful answers are that the package is gone or
     * that its content is invalid.
     */
    const excludedContributor = (
      name: string,
      root: string,
      failure: ExtensionManagerFailure,
    ): Effect.Effect<ProjectionContributorExclusion> =>
      Effect.gen(function* () {
        const probe = yield* Effect.result(fs.exists(path.join(root, KNOWLEDGE_MANIFEST_FILENAME)));
        const manifestPresent = Result.isSuccess(probe) && probe.success;
        if (!manifestPresent) return { contributor: name, reason: "package-missing" };
        return {
          contributor: name,
          reason: "package-invalid",
          detail:
            failure._tag === "KnowledgeDefinitionInvalid"
              ? failure.detail
              : describeKnowledgeFailure(failure),
        };
      });

    /**
     * Resolve the contributor set for the discovery region. A bundle that
     * fails inspection cannot supply a row, so it is excluded and reported
     * rather than failing every other bundle's command with it. Resolution
     * failures — a missing lock entry, an unsupported workspace-authored
     * bundle — remain fail-closed: they are AXM state problems, not bundle
     * content problems.
     */
    const selectKnowledgeBundles = (
      graph: DesiredStateGraph,
      locked: Readonly<Record<string, KnowledgeLockEntry>>,
      configured: KnowledgeMap,
      config: ResolvedKnowledgeDiscoveryConfig,
      instructionFilesEnabled: boolean,
    ): Effect.Effect<
      ProjectionSelection<KnowledgeDiscoveryBundle>,
      ExtensionManagerFailure,
      ManagerRequirements
    > =>
      Effect.forEach(
        graph.nodes.filter((node) => node.type === "knowledge" && node.enabled),
        (node) =>
          Effect.gen(function* () {
            const observation = yield* observeDesiredKnowledge(node, locked[node.name]);
            const workspaceInstructionEntry = configured[node.name]?.instructionEntry;
            const resolveInclusion = (manifestInstructionEntry?: boolean) =>
              resolveKnowledgeInstructionEntry({
                bundleEnabled: node.enabled,
                instructionFilesEnabled,
                knowledgeInstructionsEnabled: config.instructions,
                ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
                ...(manifestInstructionEntry === undefined ? {} : { manifestInstructionEntry }),
              });
            // Resolution facts stay fail-closed: they are AXM state problems,
            // not bundle content problems.
            if (observation.status === "missing-resolution") {
              return yield* new KnowledgeResolutionMissing({ name: node.name });
            }
            if (observation.path === undefined) {
              return yield* new KnowledgeDefinitionInvalid({
                detail:
                  node.identity.authority === "workspace"
                    ? "User workspaces do not support workspace-authored Knowledge bundles"
                    : canonicalObservationFactText(node, observation),
              });
            }
            const root = observation.path;
            // A bundle the observation does not find usable, or whose package
            // cannot be inspected, is left out of the region and reported. A
            // bundle the workspace would not publish anyway is simply absent;
            // reporting it would be noise.
            const excluded = (exclusion: ProjectionContributorExclusion) =>
              resolveInclusion().included
                ? { contributors: [], exclusions: [exclusion] }
                : { contributors: [], exclusions: [] };
            if (observation.status !== "usable") {
              return excluded({
                contributor: node.name,
                reason: observation.status === "missing" ? "package-missing" : "package-invalid",
                detail: canonicalObservationFactText(node, observation),
              });
            }
            const inspection = yield* Effect.result(inspectPackage(root));
            if (Result.isFailure(inspection)) {
              return excluded(yield* excludedContributor(node.name, root, inspection.failure));
            }
            const inspected = inspection.success;
            const resolution = resolveInclusion(inspected.manifest.instructionEntry);
            return {
              contributors: resolution.included ? [toProjectionBundle(root, inspected)] : [],
              exclusions: [],
            };
          }),
      ).pipe(
        Effect.map((selections) => ({
          contributors: selections.flatMap(({ contributors }) => contributors),
          exclusions: selections.flatMap(({ exclusions }) => exclusions),
        })),
      );

    const resolveKnowledgeProjection = () =>
      Effect.gen(function* () {
        const graph = yield* desiredState.graph();
        const locked = yield* lockfile.entries("knowledge");
        const configured = yield* settings.entries("knowledge");
        const config = yield* settings.knowledgeDiscoveryConfig;
        const instructionsTarget = yield* getInstructionsTarget();
        return { graph, locked, configured, config, instructionsTarget };
      });

    const runKnowledgeProjectionAdapter = (args: {
      readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
      readonly config: ResolvedKnowledgeDiscoveryConfig;
      readonly instructionsTarget: {
        readonly path: string;
        readonly enabled: boolean;
        readonly preserveSource: boolean;
      };
      readonly dryRun?: boolean;
    }) =>
      provide(
        reconcileKnowledgeDiscovery({
          scopeRoot: baseDir,
          config: args.config,
          bundles: args.bundles,
          instructionsPath: args.instructionsTarget.path,
          instructionManagementEnabled: args.instructionsTarget.enabled,
          preserveInstructionsSource: args.instructionsTarget.preserveSource,
          ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
        }),
      );

    const makeKnowledgeProjectionPlan = (): Effect.Effect<
      ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>,
      ExtensionManagerFailure,
      ManagerRequirements
    > =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection();
        return yield* planAggregateProjection({
          unitId: "knowledge:discovery-region",
          targetFile: instructionsTarget.path,
          graph,
          select: (completeGraph) =>
            selectKnowledgeBundles(
              completeGraph,
              locked,
              configured,
              config,
              instructionsTarget.enabled,
            ),
          adapter: {
            observe: (input) =>
              runKnowledgeProjectionAdapter({
                bundles: input.contributors,
                config,
                instructionsTarget,
                dryRun: true,
              }).pipe(
                Effect.map((result) => ({
                  unitId: "knowledge:discovery-region",
                  path: `${instructionsTarget.path}#knowledge`,
                  owner: KNOWLEDGE_REGION_OWNER,
                  present: Option.isSome(result.observedRegion),
                  current: !result.changed,
                  expectedContributors: input.contributors.map(
                    ({ owner, name }) => `${owner}/knowledge/${name}`,
                  ),
                })),
              ),
            apply: (input) =>
              runKnowledgeProjectionAdapter({
                bundles: input.contributors,
                config,
                instructionsTarget,
              }).pipe(Effect.asVoid),
          },
        });
      });

    const projectionPlans = () => makeKnowledgeProjectionPlan().pipe(Effect.map((plan) => [plan]));

    const applyKnowledgeProjection = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const reconcileDiscovery = (options?: { readonly dryRun?: boolean }) =>
      resolveKnowledgeProjection().pipe(
        Effect.flatMap(({ graph, locked, configured, config, instructionsTarget }) =>
          requireCompleteGraph(graph).pipe(
            Effect.flatMap((completeGraph) =>
              selectKnowledgeBundles(
                completeGraph,
                locked,
                configured,
                config,
                instructionsTarget.enabled,
              ),
            ),
            Effect.flatMap(({ contributors, exclusions }) =>
              runKnowledgeProjectionAdapter({
                bundles: contributors,
                config,
                instructionsTarget,
                ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
              }).pipe(
                Effect.map((result) => ({
                  ...result,
                  warnings: formatProjectionExclusions({
                    exclusions,
                    targetFile: instructionsTarget.path,
                  }),
                })),
              ),
            ),
          ),
        ),
      );

    const restoreLockedPackage = (name: string, entry: KnowledgeLockEntry) =>
      Effect.gen(function* () {
        const ref = yield* knowledgeLockEntryToRef(name, entry, {
          baseDir,
          path,
          scope: location.scope,
          getConfiguredSourceByName: (sourceName: string) => settings.sourceByName(sourceName),
        });
        if (ref.refType === "registry" && Option.isNone(ref.integrity)) {
          return yield* new KnowledgeUnavailable({
            detail: `Locked registry Knowledge bundle has no integrity and cannot be restored: ${name}`,
          });
        }
        if (ref.refType !== "git-hosted") {
          return yield* preparePackage(ref);
        }
        const discovered = yield* sources.find(ref.source, {
          names: [name],
          type: "knowledge",
          owner: Option.none(),
          versionRange: Option.none(),
        });
        const candidate = discovered.find(
          (item): item is GitHostedKnowledgeRef =>
            item.type === "knowledge" && item.refType === "git-hosted",
        );
        if (
          candidate === undefined ||
          candidate.gitTreeSha !== ref.gitTreeSha ||
          candidate.gitCommitSha !== ref.gitCommitSha
        ) {
          return yield* new KnowledgeUnavailable({
            detail: `Git Knowledge source no longer resolves to locked commit/tree ${ref.gitCommitSha}/${ref.gitTreeSha}: ${name}`,
          });
        }
        return yield* preparePackage(candidate);
      });

    const syncLocked = (
      dryRun: boolean,
    ): Effect.Effect<
      KnowledgeSyncResult,
      ExtensionManagerFailure,
      ManagerRequirements | Scope.Scope
    > =>
      Effect.gen(function* () {
        const desired = yield* activeKnowledgeNodes();
        const locked = yield* lockfile.entries("knowledge");
        const prepared: Array<PreparedKnowledgePackage> = [];
        for (const node of desired) {
          const { name } = node;
          const entry = locked[name];
          const observation = yield* observeDesiredKnowledge(node, entry);
          if (observation.status === "usable") continue;
          if (node.identity.authority === "workspace") {
            return yield* new KnowledgeDefinitionInvalid({
              detail: `Active workspace-authored Knowledge bundle is missing or invalid: ${name}. ${canonicalObservationFactText(node, observation)}`,
            });
          }
          if (entry === undefined) {
            return yield* new KnowledgeResolutionMissing({ name });
          }
          const restored = yield* Effect.result(restoreLockedPackage(name, entry));
          if (Result.isFailure(restored)) {
            yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
              discard: true,
            });
            const restoreFailure = restored.failure;
            return yield* new KnowledgeUnavailable({
              detail: `Active Knowledge bundle could not be restored: ${name}. ${describeKnowledgeFailure(restoreFailure)}`,
              cause: restoreFailure,
            });
          } else prepared.push(restored.success);
        }
        const discovered = yield* Effect.result(reconcileDiscovery({ dryRun: true }));
        if (Result.isFailure(discovered)) {
          yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
            discard: true,
          });
          return yield* Effect.fail(discovered.failure);
        }
        if (!dryRun) yield* applyKnowledgeProjection;
        yield* Effect.forEach(
          dryRun ? [...prepared].reverse() : prepared,
          (item) => (dryRun ? item.rollback : item.commit),
          { discard: true },
        );
        const discovery = discovered.success;
        return {
          changed: prepared.length > 0 || discovery.changed,
          warnings: discovery.warnings,
          artifacts: discovery.artifacts,
        };
      });

    // Canonical removal only. The shared operation flow re-renders the
    // discovery region after settings and lock removal, once the target has
    // left the graph.
    const materializeUninstall: KnowledgeManagerService["materializeUninstall"] = Effect.fn(
      "KnowledgeManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* provide(
        acceptedCanonicalObservation({
          type: "knowledge",
          name: target.name,
        }),
      );
      // Only content the canonical observation ties to accepted ownership is
      // removed; a lock row alone owns nothing on disk.
      const ownedRoot = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(ownedRoot)) {
        yield* protectWorkspacePath(ownedRoot.value);
        yield* fs.remove(ownedRoot.value, { recursive: true, force: true }).pipe(
          Effect.mapError(
            (cause) =>
              new KnowledgeIoFailed({
                detail: `Failed to remove Knowledge package source: ${ownedRoot.value}`,
                cause,
              }),
          ),
        );
      }
      return withdrawn;
    });
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this bundle's routing.
    const materializeDeactivate: KnowledgeManagerService["materializeDeactivate"] = Effect.fn(
      "KnowledgeManager.materializeDeactivate",
    )(() => applyKnowledgeProjection.pipe(Effect.as(withdrawn)));

    const acquireCanonical: KnowledgeManagerService["materializeInstall"] = Effect.fn(
      "KnowledgeManager.materializeInstall",
    )(function* ({ ref, force }) {
      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? stripFileProtocol(ref.location),
            )
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* new KnowledgeDefinitionInvalid({
          detail: `Local knowledge source must stay within the workspace: ${ref.source.path}`,
        });
      }
      const prepared = yield* preparePackage(ref, force === true);
      yield* prepared.commit;
      return acquiredFacts(prepared, workspaceRelativeLocalSourcePath);
    }, Effect.scoped);

    return {
      projectionPlans,
      refreshCatalog: () =>
        runWorkspaceTransaction({
          transition: applyKnowledgeProjection,
          validate: () => Effect.void,
        }),
      sync: ({ dryRun }) =>
        dryRun
          ? Effect.scoped(syncLocked(true))
          : Effect.scoped(
              runWorkspaceTransaction({
                transition: syncLocked(false),
                validate: () => Effect.void,
              }),
            ),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        provide(isObservedInstalled(records, "knowledge", target.name)),
      materializeInstall: acquireCanonical,
      acquireCanonical,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            type: "knowledge",
            name: ref.knowledge.name,
            ref,
          }),
        ),
      getConfiguredSource: ({ target }) =>
        settings
          .entries("knowledge")
          .pipe(Effect.map((entries) => Option.fromUndefinedOr(entries[target.name]?.source))),
      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: () =>
        Effect.gen(function* () {
          const nodes = yield* activeKnowledgeNodes();
          const refs = yield* Effect.forEach(
            nodes,
            (node) =>
              provide(
                usableAcceptedCanonicalRef({
                  type: "knowledge",
                  name: node.name,
                }).pipe(
                  Effect.map(
                    Option.filter((ref): ref is KnowledgeExtensionRef => ref.type === "knowledge"),
                  ),
                ),
              ),
            { concurrency: 16 },
          );
          return refs.flatMap((ref) => (Option.isSome(ref) ? [ref.value] : []));
        }),
      materializeUninstall,
      materializeDeactivate,
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            type: "knowledge",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "knowledge") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "knowledge",
              targetName: target.name,
            });
          }
          return yield* materializeDeactivate({ target });
        }),
      acceptedResolution: ({ ref, materialization }) =>
        acceptedResolutionFor({
          ref,
          acquired: Option.flatMap(materialization, (facts) =>
            Option.flatMap(facts.acquired, ({ treeIntegrity, ...identity }) =>
              treeIntegrity === undefined
                ? Option.none()
                : Option.some({ ...identity, treeIntegrity }),
            ),
          ),
        }),
      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies KnowledgeManagerService;
  }),
);
