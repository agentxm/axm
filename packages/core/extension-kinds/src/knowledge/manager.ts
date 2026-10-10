import {
  prepareCanonicalParents,
  retireCanonicalDirectory,
  materializeExternalPackageWithTreeIntegrity,
  recordMaterializedPackage,
} from "@agentxm/workspace-kernel/acquisition";
// @effect-diagnostics anyUnknownInErrorContext:off — schema and filesystem errors are swept into KnowledgeIoFailed inside this manager
/** Lifecycle manager for isolated Open Knowledge Format bundles. */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  contributorSetBlockers,
  contributorSetComplete,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  computeExtensionPathsForLayout,
  observeCanonicalExtension,
  type DesiredExtensionNode,
  computePackageContentHash,
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
  type KnowledgeLockEntry,
  type KnowledgeMap,
  lockEntryToRef,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
  isSourcedDesiredExtension,
  type DesiredStateGraph,
  type ResolvedKnowledgeDiscoveryConfig,
} from "@agentxm/workspace-kernel/workspace-state";

import { fromFileLocation } from "@agentxm/host-primitives";
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
import {
  acceptedResolutionFor,
  type ManagerRequirements,
  NO_MATERIALIZATION_OBSERVATION,
  type KnowledgeMaterializationFacts,
  type ExtensionManagerFailure,
  KnowledgeManager,
  type KnowledgeManagerService,
  type KnowledgeSyncResult,
  failureTag,
  type ExtensionKindFailure,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  type NativeProjectionOptions,
} from "@agentxm/workspace-kernel/materialization";
import {
  applyInstructionSurfacePlans,
  formatProjectionExclusions,
  planAggregateProjection,
  type ProjectionContributorExclusion,
  type ProjectionPlan,
  type ProjectionSelection,
  requireCompleteContributors,
  KNOWLEDGE_REGION_OWNER,
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryBundle,
  resolveInstructionsConfig,
  canonicalObservationFactText,
  resolveKnowledgeInstructionEntry,
  captureAgentOutputAuthority,
  observeProjectionPlans,
  type NativeRegionSource,
} from "@agentxm/workspace-kernel/projection";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  assertNoPhysicalOverlap,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import {
  makeWorkspaceRelativeSourcePath,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
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
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

interface PreparedKnowledgePackage {
  readonly root: string;
  readonly sourceHash: SourceHash;
  readonly treeIntegrity?: TreeIntegrity;
  readonly inspected: {
    readonly manifest: KnowledgeManifest;
    readonly inspection: KnowledgeInspection;
  };
  readonly commit: Effect.Effect<void, ExtensionManagerFailure, ManagerRequirements>;
}

const decodeManifest = Schema.decodeUnknownEffect(KnowledgeManifestSchema);

/**
 * Name the failure that stopped a restore in the operator's sentence: the
 * producing family carries its own detail, so no application envelope is
 * needed to describe it.
 */
const describeKnowledgeFailure = (
  failure: { readonly _tag: string } | ExtensionKindFailure,
): string =>
  "detail" in failure && typeof failure.detail === "string" ? failure.detail : failureTag(failure);

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
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

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
      nativeInsertionEligible = false,
    ): Effect.Effect<
      PreparedKnowledgePackage,
      ExtensionManagerFailure,
      ManagerRequirements | Scope.Scope
    > =>
      Effect.gen(function* () {
        const canonicalPath = canonicalPathForRef(ref);
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new KnowledgeDefinitionInvalid({ detail }),
          });
          const root = ref.location;
          const inspected = yield* inspectPackage(root);
          return {
            root,
            inspected,
            sourceHash: ref.sourceHash,
            commit: Effect.void,
          };
        }
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-knowledge-package-" });
        const stagedPath = path.join(tempDir, "staged");
        // Reuse is judged against canonicalPath; acquired bytes go to stagedPath.
        const acquired = yield* acquireCanonicalForRef({
          ref,
          type: "knowledge",
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("knowledge", ref.knowledge.name),
          force,
          stage: { baseDir: tempDir, destinationPath: stagedPath },
          copyFailure: {
            code: "validation",
            detail: (target) => `Failed to copy knowledge package to ${target}`,
          },
        });
        if (acquired.reused) {
          return {
            root: canonicalPath,
            inspected: yield* inspectPackage(canonicalPath),
            sourceHash: yield* provide(computePackageContentHash(canonicalPath)),
            treeIntegrity: acquired.treeIntegrity,
            commit: Effect.void,
          };
        }
        const stagedRoot = acquired.packageRoot;
        const inspected = yield* inspectPackage(stagedRoot);
        const sourceHash = yield* provide(computePackageContentHash(stagedRoot));
        const treeIntegrity = acquired.treeIntegrity;
        // Scoped acquisition is read-only with respect to canonical state. The
        // enclosing workspace transaction alone owns publication and rollback.
        return {
          root: canonicalPath,
          inspected,
          sourceHash,
          treeIntegrity,
          commit: materializeExternalPackageWithTreeIntegrity<
            ExtensionManagerFailure,
            ManagerRequirements
          >({
            baseDir,
            canonicalPath,
            sourceLocation: stagedRoot,
            ...(nativeInsertionEligible
              ? { prepareParents: prepareCanonicalParents({ canonicalPath, eligible: true }) }
              : {}),
            copyFailureCode: "internal",
            copyFailureDetail: (target) =>
              `Failed to publish prepared Knowledge package: ${target}`,
            validate: (staged) =>
              computeMaterializedTreeIntegrity(staged).pipe(
                Effect.flatMap((actual) =>
                  actual === treeIntegrity
                    ? Effect.void
                    : Effect.fail(
                        new KnowledgeDefinitionInvalid({
                          detail: "Prepared Knowledge package changed before publication",
                        }),
                      ),
                ),
              ),
          }).pipe(
            Effect.flatMap(() => recordMaterializedPackage(ref, canonicalPath, treeIntegrity)),
          ),
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
        const declaredPath = path.resolve(baseDir, relative.value);
        const { address } = yield* assertNativeMutationWithinRoots(
          nativeAuthorityRoots(
            path,
            { workspaceRoot: baseDir, scope: location.scope },
            location.nativeDirectoryInputs,
          ),
          declaredPath,
          "content",
          path.dirname(location.runtimeDir),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new KnowledgeDefinitionInvalid({
                detail: `Knowledge instruction source is not writable: ${relative.value}`,
                cause,
              }),
          ),
        );
        return {
          path: address.referentPath ?? address.entryPath,
          declaredPath,
          enabled,
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

    // The active Knowledge set is complete exactly when the Knowledge
    // contributor set is: a problem about another type does not hide it.
    const activeKnowledgeNodes = (proposedGraph?: DesiredStateGraph) =>
      Effect.gen(function* () {
        const graph = proposedGraph ?? (yield* desiredState.graph());
        if (!contributorSetComplete(contributorSetBlockers(graph, "knowledge"))) {
          return yield* new KnowledgeDesiredStateUnreconcilable();
        }
        return graph.nodes
          .filter(isSourcedDesiredExtension)
          .filter((node) => node.type === "knowledge" && node.enabled);
      });

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
          detail: describeKnowledgeFailure(failure),
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

    const resolveKnowledgeProjection = (options?: NativeProjectionOptions) =>
      Effect.gen(function* () {
        const graph = options?.desiredGraph ?? (yield* desiredState.graph());
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
        readonly declaredPath: string;
        readonly enabled: boolean;
      };
      readonly dryRun?: boolean;
      readonly ownership: ReadonlyArray<NativeRegionSource>;
      readonly configuredAgents: ReadonlyArray<string>;
      readonly eligible: boolean;
    }) =>
      provide(
        reconcileKnowledgeDiscovery({
          scopeRoot: baseDir,
          ownerRoot: path.dirname(location.runtimeDir),
          scope: location.scope,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          configuredAgentIds: args.configuredAgents,
          ownership: args.ownership,
          eligible: args.eligible,
          config: args.config,
          bundles: args.bundles,
          instructionsPath: args.instructionsTarget.path,
          instructionsDeclaredPath: args.instructionsTarget.declaredPath,
          instructionManagementEnabled: args.instructionsTarget.enabled,
          ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
        }),
      ).pipe(
        Effect.tap((result) =>
          args.dryRun === true
            ? Effect.void
            : Ref.set(lastProjection, {
                agents: args.configuredAgents,
                targets: result.artifacts.map((artifact) => ({
                  path: artifact.path,
                  agentIds: args.configuredAgents,
                })),
                nativeLocations: result.nativeLocations,
              }),
        ),
      );

    const makeKnowledgeProjectionPlan = (
      prospective: ReadonlyArray<KnowledgeDiscoveryBundle> = [],
      options?: NativeProjectionOptions,
      replacedNames: ReadonlySet<string> = new Set(prospective.map(({ name }) => name)),
    ): Effect.Effect<
      ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>,
      ExtensionManagerFailure,
      ManagerRequirements
    > =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection(options);
        const configuredAgents = options?.configuredAgents ?? (yield* settings.configuredAgents);
        const accepted = yield* captureAgentOutputAuthority();
        const ownership = [
          ...accepted.expectedRegions.knowledge,
          ...(options?.priorAuthority?.expectedRegions.knowledge ?? []),
          ...prospective.map(({ name, owner, sourceDir }) => ({
            name,
            ref: `${owner}/knowledge/${name}`,
            root: path.relative(baseDir, path.dirname(sourceDir)),
            scope: location.scope,
          })),
        ];
        const selection = yield* selectKnowledgeBundles(
          {
            ...graph,
            nodes: graph.nodes.filter(
              (node) => node.type !== "knowledge" || !replacedNames.has(node.name),
            ),
          },
          locked,
          configured,
          config,
          instructionsTarget.enabled,
        );
        const bundles = [...selection.contributors, ...prospective];
        const eligible =
          bundles.some(({ name }) => options?.nativeInsertionEligibleNames?.has(name)) ||
          (configuredAgents.length > 0 &&
            configuredAgents.every((id) => options?.nativeInsertionEligibleAgentIds?.has(id)));
        const plan = yield* planAggregateProjection({
          unitId: "knowledge:discovery-region",
          targetFile: instructionsTarget.path,
          graph,
          select: () => Effect.succeed({ contributors: bundles, exclusions: selection.exclusions }),
          adapter: {
            observe: (input) =>
              runKnowledgeProjectionAdapter({
                bundles: input.contributors,
                config,
                instructionsTarget,
                ownership,
                configuredAgents,
                eligible,
                dryRun: true,
              }).pipe(
                Effect.map((result) => ({
                  unitId: "knowledge:discovery-region",
                  nativeLocations: result.nativeLocations,
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
                ownership,
                configuredAgents,
                eligible,
              }).pipe(Effect.asVoid),
          },
        });
        yield* observeProjectionPlans([plan]);
        return plan;
      });

    const projectionPlans: KnowledgeManagerService["projectionPlans"] = (options) =>
      makeKnowledgeProjectionPlan([], options).pipe(Effect.map((plan) => [plan]));
    const prepareProjection: KnowledgeManagerService["prepareProjection"] = (refs, options) =>
      Effect.gen(function* () {
        const { graph, configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection(options);
        const prospective = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const source =
                  ref.refType === "registry"
                    ? (yield* sources.fetch(ref)).directory
                    : fromFileLocation(ref.location);
                yield* assertNoPhysicalOverlap(source, instructionsTarget.path).pipe(
                  Effect.mapError(
                    (cause) =>
                      new KnowledgeDefinitionInvalid({
                        detail: "Knowledge native target overlaps its input source",
                        cause,
                      }),
                  ),
                );
                const inspected = yield* inspectPackage(source);
                const workspaceInstructionEntry = configured[ref.knowledge.name]?.instructionEntry;
                const manifestInstructionEntry = inspected.manifest.instructionEntry;
                const inclusion = resolveKnowledgeInstructionEntry({
                  bundleEnabled:
                    graph.nodes.find(
                      (node) => node.type === "knowledge" && node.name === ref.knowledge.name,
                    )?.enabled ?? true,
                  instructionFilesEnabled: instructionsTarget.enabled,
                  knowledgeInstructionsEnabled: config.instructions,
                  ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
                  ...(manifestInstructionEntry === undefined ? {} : { manifestInstructionEntry }),
                });
                const canonical = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  KNOWLEDGE_EXTENSION_DIR,
                  ref.knowledge.name,
                ).canonicalPath;
                return inclusion.included ? [toProjectionBundle(canonical, inspected)] : [];
              }),
            ),
          { concurrency: 1 },
        );
        return [
          yield* makeKnowledgeProjectionPlan(
            prospective.flat(),
            options,
            new Set(refs.map((ref) => ref.knowledge.name)),
          ),
        ];
      });

    const applyKnowledgeProjection = projectionPlans().pipe(
      Effect.flatMap(applyInstructionSurfacePlans),
      Effect.asVoid,
    );

    const reconcileDiscovery = (options?: {
      readonly dryRun?: boolean;
      readonly nativeProjection?: NativeProjectionOptions;
      readonly prospective?: ReadonlyArray<KnowledgeDiscoveryBundle>;
      readonly replacedNames?: ReadonlySet<string>;
    }) =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection(options?.nativeProjection);
        const completeGraph = yield* requireCompleteContributors(graph, "knowledge");
        const selection = yield* selectKnowledgeBundles(
          {
            ...completeGraph,
            nodes: completeGraph.nodes.filter(
              (node) => node.type !== "knowledge" || !options?.replacedNames?.has(node.name),
            ),
          },
          locked,
          configured,
          config,
          instructionsTarget.enabled,
        );
        const contributors = [...selection.contributors, ...(options?.prospective ?? [])];
        const exclusions = selection.exclusions;
        const authority = yield* captureAgentOutputAuthority();
        const configuredAgents =
          options?.nativeProjection?.configuredAgents ?? (yield* settings.configuredAgents);
        const eligible =
          contributors.some(({ name }) =>
            options?.nativeProjection?.nativeInsertionEligibleNames?.has(name),
          ) ||
          (configuredAgents.length > 0 &&
            configuredAgents.every((id) =>
              options?.nativeProjection?.nativeInsertionEligibleAgentIds?.has(id),
            ));
        const result = yield* runKnowledgeProjectionAdapter({
          bundles: contributors,
          config,
          instructionsTarget,
          ownership: [
            ...authority.expectedRegions.knowledge,
            ...(options?.nativeProjection?.priorAuthority?.expectedRegions.knowledge ?? []),
          ],
          configuredAgents,
          eligible,
          ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        });
        return {
          ...result,
          warnings: formatProjectionExclusions({ exclusions, targetFile: instructionsTarget.path }),
        };
      });

    const restoreLockedPackage = (name: string, entry: KnowledgeLockEntry) =>
      Effect.gen(function* () {
        const ref = yield* lockEntryToRef.knowledge(name, entry, {
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
      nativeProjection?: NativeProjectionOptions,
    ): Effect.Effect<
      KnowledgeSyncResult,
      ExtensionManagerFailure,
      ManagerRequirements | Scope.Scope
    > =>
      Effect.gen(function* () {
        const desired = yield* activeKnowledgeNodes(nativeProjection?.desiredGraph);
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
            const restoreFailure = restored.failure;
            return yield* new KnowledgeUnavailable({
              detail: `Active Knowledge bundle could not be restored: ${name}. ${describeKnowledgeFailure(restoreFailure)}`,
              cause: restoreFailure,
            });
          } else prepared.push(restored.success);
        }
        const { configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection(nativeProjection);
        const prospective = prepared.flatMap((item) => {
          const workspaceInstructionEntry =
            configured[item.inspected.manifest.name]?.instructionEntry;
          const manifestInstructionEntry = item.inspected.manifest.instructionEntry;
          return resolveKnowledgeInstructionEntry({
            bundleEnabled: true,
            instructionFilesEnabled: instructionsTarget.enabled,
            knowledgeInstructionsEnabled: config.instructions,
            ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
            ...(manifestInstructionEntry === undefined ? {} : { manifestInstructionEntry }),
          }).included
            ? [toProjectionBundle(item.root, item.inspected)]
            : [];
        });
        const discovery = yield* reconcileDiscovery({
          dryRun: true,
          prospective,
          replacedNames: new Set(prepared.map((item) => item.inspected.manifest.name)),
          ...(nativeProjection === undefined ? {} : { nativeProjection }),
        });
        if (!dryRun) {
          yield* Effect.forEach(prepared, (item) => item.commit, { discard: true });
          yield* projectionPlans(nativeProjection).pipe(
            Effect.flatMap(applyInstructionSurfacePlans),
          );
        }
        return {
          changed: prepared.length > 0 || discovery.changed,
          nativeLocations: discovery.nativeLocations,
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
        yield* retireCanonicalDirectory(ownedRoot.value);
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
    )(function* ({ ref, force, nativeInsertionEligible }) {
      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? fromFileLocation(ref.location),
            )
          : Option.none<string>();
      const prepared = yield* preparePackage(ref, force === true, nativeInsertionEligible);
      yield* prepared.commit;
      return acquiredFacts(prepared, workspaceRelativeLocalSourcePath);
    }, Effect.scoped);

    return {
      projectionPlans,
      prepareProjection,
      aggregateProjectionObservation: Ref.get(lastProjection),
      refreshCatalog: () =>
        runWorkspaceTransaction({
          transition: applyKnowledgeProjection,
          validate: () => Effect.void,
        }),
      sync: ({ dryRun, nativeProjection }) =>
        dryRun
          ? Effect.scoped(syncLocked(true, nativeProjection))
          : Effect.scoped(
              runWorkspaceTransaction({
                transition: syncLocked(false, nativeProjection),
                validate: () => Effect.void,
              }),
            ),
      ...makeBaseManagerMembers({
        type: "knowledge",
        spanPrefix: "KnowledgeManager",
        records,
        settings,
        refName: (ref) => ref.knowledge.name,
        materializeInstall: acquireCanonical,
        // Retaining canonical Knowledge withdraws its discovery output.
        retained: ({ target }) => materializeDeactivate({ target }),
      }),
      materializeInstall: acquireCanonical,
      acquireCanonical,
      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: () =>
        listMaterializableFromAccepted({
          type: "knowledge",
          names: activeKnowledgeNodes().pipe(Effect.map((nodes) => nodes.map((node) => node.name))),
        }),
      materializeUninstall,
      materializeDeactivate,
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
