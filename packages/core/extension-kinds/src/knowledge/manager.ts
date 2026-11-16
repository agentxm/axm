import {
  prepareCanonicalParents,
  retireCanonicalDirectory,
  materializeExternalPackageWithTreeIntegrity,
  recordMaterializedPackage,
} from "@agentxm/workspace-kernel/acquisition";
// @effect-diagnostics anyUnknownInErrorContext:off — schema and filesystem errors are swept into KnowledgeIoFailed inside this manager
/** Lifecycle manager for isolated Open Knowledge Format bundles. */

import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Ref from "effect/Ref";
import {
  AcceptedResolutionWriter,
  contributorSetBlockers,
  contributorSetComplete,
  computeExtensionPathsForLayout,
  observeCanonicalExtensionCapturing,
  capturedManifestFor,
  type DesiredExtensionNode,
  computePackageContentHash,
  type TreeIntegrity,
  type KnowledgeLockEntry,
  type KnowledgeMap,
  lockEntryToRef,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
  isSourcedDesiredExtension,
  type DesiredStateGraph,
  type ResolvedKnowledgeDiscoveryConfig,
  workspaceReadPhaseFor,
  inspectKnowledgePackageInPhase,
  CurrentWorkspaceReadPhase,
} from "@agentxm/workspace-kernel/workspace-state";

import { fromFileLocation } from "@agentxm/host-primitives";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
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
  captureManagerServices,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  type NativeProjectionOptions,
} from "@agentxm/workspace-kernel/materialization";
import {
  applyObservedInstructionSurfacePlans,
  formatProjectionExclusions,
  planAggregateProjection,
  type ProjectionContributorExclusion,
  type ProjectionPlan,
  type ProjectionSelection,
  requireCompleteContributors,
  KNOWLEDGE_REGION_OWNER,
  knowledgeRegionGeneration,
  projectionUnitPath,
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryBundle,
  resolveInstructionsConfig,
  canonicalObservationFactText,
  resolveKnowledgeInstructionEntry,
  captureAgentOutputAuthority,
  withObservedProjectionPlans,
  withHandedProjectionObservations,
  handedOverCanonicalObservation,
  type NativeRegionSource,
  type ProjectionUnitObservation,
} from "@agentxm/workspace-kernel/projection";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  assertNoPhysicalOverlap,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";
import {
  makeWorkspaceRelativeSourcePath,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { withSharedGitDiscoveryCheckouts } from "@agentxm/workspace-kernel/sources";
import {
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import {
  inspectKnowledgePackage,
  inspectKnowledgePackageWithManifest,
  type KnowledgeInspection,
} from "@agentxm/extension-content/knowledge";
import { ManifestError } from "@agentxm/extension-content";
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

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

/**
 * A deeply frozen value: the value itself when it is already frozen, as
 * decoded workspace documents are, otherwise a frozen copy this call owns.
 */
const ownedFrozen = <A>(value: A): A => {
  if (Object.isFrozen(value)) return value;
  const copy = structuredClone(value);
  const freeze = (current: unknown): void => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current)) return;
    for (const nested of Object.values(current)) freeze(nested);
    Object.freeze(current);
  };
  freeze(copy);
  return copy;
};

/**
 * Name the failure that stopped a restore in the operator's sentence: the
 * producing family carries its own detail, so no application envelope is
 * needed to describe it.
 */
const describeKnowledgeFailure = (
  failure: { readonly _tag: string } | ExtensionKindFailure,
): string =>
  "detail" in failure && typeof failure.detail === "string" ? failure.detail : failureTag(failure);

/** A differing digest a sync's own observation computed of one canonical tree. */
type ObservedCanonicalMismatch = Parameters<typeof acquireCanonicalForRef>[0]["observedMismatch"];

export const KnowledgeManagerLive = Layer.effect(
  KnowledgeManager,
  Effect.gen(function* () {
    const { location, settings, lockfile, desiredState, records, sources, provide, provideRead } =
      yield* captureManagerServices;
    const planningSettings = workspaceReadPhaseFor(location).pipe(
      Effect.map((phase) => phase?.readers.settings ?? settings),
    );
    const accepted = yield* AcceptedResolutionWriter;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = location.baseDir;
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

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
      computeExtensionPathsForLayout(path.join, currentLayout(), ref, "knowledge", ref.name)
        .canonicalPath;

    /**
     * Judge a package inspection: a failure is the package's definition
     * problem, and so is any error diagnostic it reports.
     */
    const judgeInspection = <R>(
      inspected: Effect.Effect<
        Effect.Success<ReturnType<typeof inspectKnowledgePackage>>,
        Effect.Error<ReturnType<typeof inspectKnowledgePackage>>,
        R
      >,
    ) =>
      Effect.gen(function* () {
        const { manifest, inspection } = yield* inspected.pipe(
          Effect.mapError(
            (cause) =>
              new KnowledgeDefinitionInvalid({
                detail:
                  cause instanceof ManifestError
                    ? cause.detail
                    : "Failed to inspect Open Knowledge Format bundle",
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

    /**
     * Inspect a package, decoding its manifest unless the caller supplies the
     * decode it already made of this package's manifest.
     */
    const inspectPackage = (packageRoot: string, decoded?: KnowledgeManifest) =>
      judgeInspection(
        decoded === undefined
          ? inspectKnowledgePackage(packageRoot)
          : inspectKnowledgePackageWithManifest(packageRoot, decoded),
      );

    const preparePackage = (
      ref: KnowledgeExtensionRef,
      force = false,
      nativeInsertionEligible = false,
      observedMismatch?: ObservedCanonicalMismatch,
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
          ...(observedMismatch === undefined ? {} : { observedMismatch }),
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
            expectedTreeIntegrity: {
              integrity: treeIntegrity,
              mismatch: () =>
                new KnowledgeDefinitionInvalid({
                  detail: "Prepared Knowledge package changed before publication",
                }),
            },
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
        const phase = yield* workspaceReadPhaseFor(location);
        const config = yield* (phase?.readers.settings ?? settings).instructionsConfig;
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
     * The canonical observation of one desired Knowledge node, also handing
     * over the manifest it read: the only judge of whether its accepted
     * content may serve as discovery input. It always reads live.
     */
    const observeDesiredKnowledgeLive = (
      layout: ReturnType<typeof currentLayout>,
      node: DesiredExtensionNode,
      locked: KnowledgeLockEntry | undefined,
    ) =>
      provideRead(observeCanonicalExtensionCapturing({ layout, desired: node, accepted: locked }));
    type KnowledgeObservationCapture = Effect.Success<
      ReturnType<typeof observeDesiredKnowledgeLive>
    >;

    /** The read phase and filesystem port an observation reads through. */
    const currentReadPort = Effect.gen(function* () {
      return {
        phase: yield* CurrentWorkspaceReadPhase,
        fileSystem: yield* FileSystem.FileSystem,
      };
    });
    type ReadPort = Effect.Success<typeof currentReadPort>;

    /**
     * Usable observations one sync call made of its desired nodes before
     * anything was written, each with the exact layout, read phase and
     * filesystem port it was made through. They stand in only for an
     * observation of the same layout, through the same port and the same
     * read phase while it is still active (or with no phase on either side),
     * of a node and accepted row structurally equal to the ones observed; the
     * caller receives its own copy. A phase that has ended in between, for
     * example by a restore writing through its port, observes live again.
     */
    interface ObservedKnowledgeNode {
      readonly layout: ReturnType<typeof currentLayout>;
      readonly port: ReadPort;
      readonly node: DesiredExtensionNode;
      readonly accepted: KnowledgeLockEntry | undefined;
      readonly capture: KnowledgeObservationCapture;
    }
    const usableObservationsOf = (observed: ReadonlyArray<ObservedKnowledgeNode>) => {
      const recorded = Object.freeze([...observed]);
      return (
        layout: ReturnType<typeof currentLayout>,
        port: ReadPort,
        node: DesiredExtensionNode,
        accepted: KnowledgeLockEntry | undefined,
      ): Option.Option<Pick<KnowledgeObservationCapture, "observation" | "manifest">> => {
        const prior = recorded.find(
          (entry) =>
            entry.layout === layout &&
            entry.node.type === node.type &&
            entry.node.name === node.name,
        );
        return prior === undefined ||
          prior.port.phase !== port.phase ||
          (port.phase !== undefined && !port.phase.isActive()) ||
          prior.port.fileSystem !== port.fileSystem ||
          !Equal.equals(prior.node, node) ||
          !Equal.equals(prior.accepted, accepted)
          ? Option.none()
          : Option.some({
              observation: structuredClone(prior.capture.observation),
              manifest: Option.map(prior.capture.manifest, ({ path, text, decode }) => ({
                path,
                text,
                decode,
              })),
            });
      };
    };
    type UsableObservations = ReturnType<typeof usableObservationsOf>;

    /**
     * The same observation for one selection step; the capture belongs to
     * the step that asked for it. A caller that already observed this
     * identical node against the identical accepted row and layout, in the
     * still active observation phase this selection reads through, hands
     * over its own observation instead, and so does the sync call this
     * selection runs in for a node it found usable.
     */
    const observeDesiredKnowledgeCapturing = (
      node: DesiredExtensionNode,
      locked: KnowledgeLockEntry | undefined,
      observed?: UsableObservations,
    ) =>
      Effect.gen(function* () {
        const layout = currentLayout();
        const handedOver = yield* handedOverCanonicalObservation({
          layout,
          node,
          accepted: locked,
        });
        if (Option.isSome(handedOver)) return handedOver.value;
        const own =
          observed === undefined
            ? Option.none()
            : observed(layout, yield* currentReadPort, node, locked);
        if (Option.isSome(own)) return own.value;
        return yield* observeDesiredKnowledgeLive(layout, node, locked);
      });

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
        const phase = yield* workspaceReadPhaseFor(location);
        const graph = proposedGraph ?? (yield* (phase?.readers.desired ?? desiredState).graph());
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
        const probe = yield* Effect.result(
          fs.exists(path.join(root, manifestFilenameForType("knowledge"))),
        );
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
      observed?: UsableObservations,
    ): Effect.Effect<
      ProjectionSelection<KnowledgeDiscoveryBundle>,
      ExtensionManagerFailure,
      ManagerRequirements
    > =>
      Effect.forEach(
        graph.nodes.filter((node) => node.type === "knowledge" && node.enabled),
        (node) =>
          Effect.gen(function* () {
            const { observation, manifest: capturedManifest } =
              yield* observeDesiredKnowledgeCapturing(node, locked[node.name], observed);
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
            // The decode the observation just made of this package's manifest,
            // when it is that manifest; otherwise the inspection reads it. A
            // later inspection of this root through the same observation
            // phase receives this outcome.
            const decoded = capturedManifestFor(path, capturedManifest, root, "knowledge");
            const inspection = yield* Effect.result(
              judgeInspection(
                inspectKnowledgePackageInPhase(
                  root,
                  Option.isSome(decoded)
                    ? inspectKnowledgePackageWithManifest(root, decoded.value)
                    : inspectKnowledgePackage(root),
                ),
              ),
            );
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
        const phase = yield* workspaceReadPhaseFor(location);
        const currentSettings = phase?.readers.settings ?? settings;
        const currentLocks = phase?.readers.locks ?? lockfile;
        const graph =
          options?.desiredGraph ?? (yield* (phase?.readers.desired ?? desiredState).graph());
        const locked = yield* currentLocks.entries("knowledge");
        const configured = yield* currentSettings.entries("knowledge");
        const config = yield* currentSettings.knowledgeDiscoveryConfig;
        const instructionsTarget = yield* getInstructionsTarget();
        return { graph, locked, configured, config, instructionsTarget };
      });
    type KnowledgeProjectionInputs = Effect.Success<ReturnType<typeof resolveKnowledgeProjection>>;

    /**
     * The projection inputs one preparation call shares between its source
     * checks and its plan, frozen so neither consumer can change what the
     * other reads. A caller's desired graph is handed to both as it is today;
     * a graph the manager read is shared only when its reader froze it.
     * Otherwise there is nothing to share and the plan resolves its own. The
     * accepted rows have one consumer, the plan, and pass to it unchanged.
     */
    const shareableKnowledgeProjection = (
      resolved: KnowledgeProjectionInputs,
      options?: NativeProjectionOptions,
    ): KnowledgeProjectionInputs | undefined =>
      options?.desiredGraph === resolved.graph || Object.isFrozen(resolved.graph)
        ? {
            graph: resolved.graph,
            locked: resolved.locked,
            configured: ownedFrozen(resolved.configured),
            config: ownedFrozen(resolved.config),
            instructionsTarget: ownedFrozen(resolved.instructionsTarget),
          }
        : undefined;

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
      Effect.gen(function* () {
        // Reading the rows decodes the lockfile, so a newer lockfile refuses
        // before any region is written.
        const recorded = yield* accepted.projectionRows("knowledge");
        return yield* provide(
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
            recorded,
            ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
          }),
        );
      }).pipe(
        Effect.tap((result) =>
          args.dryRun === true
            ? Effect.void
            : accepted.withBatch(accepted.stageProjections(result.rowChanges)).pipe(
                Effect.andThen(
                  Ref.set(lastProjection, {
                    agents: args.configuredAgents,
                    targets: result.artifacts.map((artifact) => ({
                      path: artifact.path,
                      agentIds: args.configuredAgents,
                    })),
                    nativeLocations: result.nativeLocations,
                  }),
                ),
              ),
        ),
      );

    /** The discovery region's observation from one dry run of `contributors`. */
    const discoveryObservation = (
      result: Effect.Success<ReturnType<typeof runKnowledgeProjectionAdapter>>,
      contributors: ReadonlyArray<KnowledgeDiscoveryBundle>,
      instructionsTarget: { readonly path: string },
    ): ProjectionUnitObservation => ({
      unitId: "knowledge:discovery-region",
      nativeLocations: result.nativeLocations,
      path: `${instructionsTarget.path}#knowledge`,
      owner: KNOWLEDGE_REGION_OWNER,
      present: result.present,
      current: !result.changed,
      expectedContributors: contributors.map(({ owner, name }) => `${owner}/knowledge/${name}`),
      ...Option.match(result.lastWrite, {
        onNone: () => ({}),
        onSome: (lastWrite) => ({ lastWrite }),
      }),
    });

    /**
     * Plan the discovery region. A caller that resolved these same options'
     * projection inputs earlier in its own call, in the read phase still
     * current, hands them over instead of resolving them again.
     */
    const makeKnowledgeProjectionPlan = (
      prospective: ReadonlyArray<KnowledgeDiscoveryBundle> = [],
      options?: NativeProjectionOptions,
      replacedNames: ReadonlySet<string> = new Set(prospective.map(({ name }) => name)),
      resolved?: KnowledgeProjectionInputs,
      preselected?: ProjectionSelection<KnowledgeDiscoveryBundle>,
    ): Effect.Effect<
      ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>,
      ExtensionManagerFailure,
      ManagerRequirements
    > =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } =
          resolved ?? (yield* resolveKnowledgeProjection(options));
        const configuredAgents =
          options?.configuredAgents ?? (yield* (yield* planningSettings).configuredAgents);
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
        const selection =
          preselected ??
          (yield* selectKnowledgeBundles(
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
          ));
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
                Effect.map((result) =>
                  discoveryObservation(result, input.contributors, instructionsTarget),
                ),
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
        return plan;
      });

    const regionGeneration: KnowledgeManagerService["regionGeneration"] = Effect.gen(function* () {
      const { graph, locked, configured, config, instructionsTarget } =
        yield* resolveKnowledgeProjection();
      const selection = yield* selectKnowledgeBundles(
        graph,
        locked,
        configured,
        config,
        instructionsTarget.enabled,
      );
      const target = yield* projectionUnitPath(baseDir, instructionsTarget.declaredPath);
      return yield* knowledgeRegionGeneration({
        target,
        scopeRoot: baseDir,
        path,
        config,
        bundles: selection.contributors,
      });
    });

    // Every plan is observed as the pre-write refusal before its consumer runs.
    const observedProjectionPlans: KnowledgeManagerService["observedProjectionPlans"] = (
      options,
      use,
    ) =>
      makeKnowledgeProjectionPlan([], options).pipe(
        Effect.flatMap((plan) => withObservedProjectionPlans([plan], use)),
      );
    const projectionPlans: KnowledgeManagerService["projectionPlans"] = (options) =>
      observedProjectionPlans(options, (observed) => Effect.succeed(observed.plans));
    const observedPrepareProjection: KnowledgeManagerService["observedPrepareProjection"] = (
      refs,
      options,
      use,
    ) =>
      Effect.gen(function* () {
        const phase = yield* workspaceReadPhaseFor(location);
        const resolved = yield* resolveKnowledgeProjection(options);
        const shared = shareableKnowledgeProjection(resolved, options);
        const { graph, configured, config, instructionsTarget } = shared ?? resolved;
        const prospective = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const source =
                  ref.refType === "registry"
                    ? (yield* sources.fetch(ref)).directory
                    : ref.refType === "http"
                      ? (yield* sources.acquireForTransition(ref)).directory
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
                // The decode the caller made of this same package's knowledge
                // manifest in this boundary; otherwise inspection reads it.
                const prepared = options?.preparedManifests?.get(ref.knowledge.name);
                const inspected = yield* inspectPackage(
                  source,
                  prepared !== undefined &&
                    prepared.packageRoot === source &&
                    prepared.manifest.type === "knowledge"
                    ? prepared.manifest
                    : undefined,
                );
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
                  "knowledge",
                  ref.knowledge.name,
                ).canonicalPath;
                return inclusion.included ? [toProjectionBundle(canonical, inspected)] : [];
              }),
            ),
          { concurrency: 1 },
        );
        // The plan reuses this call's inputs only while the read phase they
        // came from is still the current one; otherwise it reads its own.
        const samePhase = (yield* workspaceReadPhaseFor(location)) === phase;
        return yield* withObservedProjectionPlans(
          [
            yield* makeKnowledgeProjectionPlan(
              prospective.flat(),
              options,
              new Set(refs.map((ref) => ref.knowledge.name)),
              samePhase ? shared : undefined,
            ),
          ],
          use,
        );
      });
    const prepareProjection: KnowledgeManagerService["prepareProjection"] = (refs, options) =>
      observedPrepareProjection(refs, options, (observed) => Effect.succeed(observed.plans));

    // The plan's eager dry run, with nothing written since, decides the
    // apply's alias reconciliation; the write still re-reads under its lock.
    const applyKnowledgeProjection = observedProjectionPlans(undefined, (observed) =>
      applyObservedInstructionSurfacePlans(observed),
    ).pipe(Effect.asVoid, Effect.provideService(AcceptedResolutionWriter, accepted));

    /**
     * Reconcile the discovery region from the projection inputs its sync
     * call resolved for these same options, with nothing written since.
     */
    const reconcileDiscovery = (options: {
      readonly projection: KnowledgeProjectionInputs;
      readonly observed: UsableObservations;
      readonly dryRun?: boolean;
      readonly nativeProjection?: NativeProjectionOptions;
      readonly prospective?: ReadonlyArray<KnowledgeDiscoveryBundle>;
      readonly replacedNames?: ReadonlySet<string>;
    }) =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } = options.projection;
        const completeGraph = yield* requireCompleteContributors(graph, "knowledge");
        const selection = yield* selectKnowledgeBundles(
          {
            ...completeGraph,
            nodes: completeGraph.nodes.filter(
              (node) => node.type !== "knowledge" || !options.replacedNames?.has(node.name),
            ),
          },
          locked,
          configured,
          config,
          instructionsTarget.enabled,
          options.observed,
        );
        const contributors = [...selection.contributors, ...(options.prospective ?? [])];
        const exclusions = selection.exclusions;
        const authority = yield* captureAgentOutputAuthority();
        const configuredAgents =
          options.nativeProjection?.configuredAgents ??
          (yield* (yield* planningSettings).configuredAgents);
        const eligible =
          contributors.some(({ name }) =>
            options.nativeProjection?.nativeInsertionEligibleNames?.has(name),
          ) ||
          (configuredAgents.length > 0 &&
            configuredAgents.every((id) =>
              options.nativeProjection?.nativeInsertionEligibleAgentIds?.has(id),
            ));
        const result = yield* runKnowledgeProjectionAdapter({
          bundles: contributors,
          config,
          instructionsTarget,
          ownership: [
            ...authority.expectedRegions.knowledge,
            ...(options.nativeProjection?.priorAuthority?.expectedRegions.knowledge ?? []),
          ],
          configuredAgents,
          eligible,
          ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        });
        return {
          ...result,
          warnings: formatProjectionExclusions({ exclusions, targetFile: instructionsTarget.path }),
          selection,
          contributors,
        };
      });

    /**
     * Restore one locked bundle. `observedMismatch` is the differing digest
     * the caller's observation of its canonical tree computed in this same
     * iteration, which the restore's reuse decision refuses reuse from.
     */
    const restoreLockedPackage = (
      name: string,
      entry: KnowledgeLockEntry,
      observedMismatch?: ObservedCanonicalMismatch,
    ) =>
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
          return yield* preparePackage(ref, false, false, observedMismatch);
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
        const usable: Array<ObservedKnowledgeNode> = [];
        // Bundles this call restores from one Git repository revision find
        // their packages in one read-only discovery checkout, held in this
        // call's scope; each still checks its own commit and tree.
        yield* withSharedGitDiscoveryCheckouts(
          Effect.gen(function* () {
            for (const node of desired) {
              const { name } = node;
              const entry = locked[name];
              const layout = currentLayout();
              const port = yield* currentReadPort;
              const capture = yield* observeDesiredKnowledgeLive(layout, node, entry);
              const { observation } = capture;
              if (observation.status === "usable") {
                if (
                  observation.path !== undefined &&
                  (port.phase === undefined || port.phase.isActive())
                )
                  usable.push({ layout, port, node, accepted: entry, capture });
                continue;
              }
              if (node.identity.authority === "workspace") {
                return yield* new KnowledgeDefinitionInvalid({
                  detail: `Active workspace-authored Knowledge bundle is missing or invalid: ${name}. ${canonicalObservationFactText(node, observation)}`,
                });
              }
              if (entry === undefined) {
                return yield* new KnowledgeResolutionMissing({ name });
              }
              const restored = yield* Effect.result(
                restoreLockedPackage(name, entry, capture.mismatchedTree),
              );
              if (Result.isFailure(restored)) {
                const restoreFailure = restored.failure;
                return yield* new KnowledgeUnavailable({
                  detail: `Active Knowledge bundle could not be restored: ${name}. ${describeKnowledgeFailure(restoreFailure)}`,
                  cause: restoreFailure,
                });
              } else prepared.push(restored.success);
            }
          }),
        );
        // One resolution serves this call until a restored bundle is
        // published: restoring stages outside canonical state, and nothing
        // between here and the discovery dry run writes.
        const resolved = yield* resolveKnowledgeProjection(nativeProjection);
        const shared = shareableKnowledgeProjection(resolved, nativeProjection);
        const projection = shared ?? resolved;
        const { configured, config, instructionsTarget } = projection;
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
          projection,
          // Restoring writes nothing canonical, so the selection may take what
          // this loop found usable, through the read phase it was found in
          // while that phase is still active.
          observed: usableObservationsOf(usable),
          dryRun: true,
          prospective,
          replacedNames: new Set(prepared.map((item) => item.inspected.manifest.name)),
          ...(nativeProjection === undefined ? {} : { nativeProjection }),
        });
        if (!dryRun) {
          yield* Effect.forEach(prepared, (item) => item.commit, { discard: true });
          const aliases = nativeProjection?.instructionAliases;
          // With nothing published, the plan takes this call's inputs and the
          // discovery dry run's selection, both frozen, and that dry run, which
          // rendered exactly this plan's unit, is its pre-write observation.
          // After a publication the plan resolves, selects and observes the
          // published state for itself, and hands that observation on.
          const apply =
            prepared.length === 0 && shared !== undefined
              ? Effect.gen(function* () {
                  const plan = yield* makeKnowledgeProjectionPlan(
                    [],
                    nativeProjection,
                    undefined,
                    shared,
                    ownedFrozen(discovery.selection),
                  );
                  const observation = discoveryObservation(
                    { ...discovery, nativeLocations: structuredClone(discovery.nativeLocations) },
                    discovery.contributors,
                    shared.instructionsTarget,
                  );
                  return yield* withHandedProjectionObservations(
                    [plan],
                    [
                      plan.exclusions.length === 0
                        ? observation
                        : { ...observation, exclusions: plan.exclusions },
                    ],
                    (observed) => applyObservedInstructionSurfacePlans(observed, aliases),
                  );
                })
              : observedProjectionPlans(nativeProjection, (observed) =>
                  applyObservedInstructionSurfacePlans(observed, aliases),
                );
          yield* apply.pipe(Effect.provideService(AcceptedResolutionWriter, accepted));
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
      observedProjectionPlans,
      prepareProjection,
      observedPrepareProjection,
      regionGeneration,
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
        location,
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
    } satisfies KnowledgeManagerService;
  }),
);
