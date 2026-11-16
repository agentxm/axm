import { retireCanonicalDirectory } from "@agentxm/workspace-kernel/acquisition";
import {
  type RuleManagerService,
  acceptedResolutionFor,
  RuleManager,
  type MaterializationObservation,
  NO_MATERIALIZATION_OBSERVATION,
  type RuleMaterializationFacts,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  captureManagerServices,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  type NativeProjectionOptions,
} from "@agentxm/workspace-kernel/materialization";

/**
 * Rule manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  AcceptedResolutionWriter,
  enabledConfiguredEntries,
  computeExtensionPathsForLayout,
  computePackageContentHash,
  computeMaterializedTreeIntegrity,
  computeMaterializedTreeDigests,
  DesiredStateReader,
  MaterializedFileTargetSchema,
  acceptedCanonicalObservation,
  capturedManifestFor,
  removableAcceptedCanonicalPath,
  stableJson,
  type ProjectionDigest,
  workspaceReadPhaseFor,
} from "@agentxm/workspace-kernel/workspace-state";

import { fromFileLocation } from "@agentxm/host-primitives";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { RuleDefinitionInvalid } from "./errors.js";
import {
  activeContributors,
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionRenderInput,
  reconcileNativeManagedRegion,
  captureAgentOutputAuthority,
  agentOutputAuthorityFrom,
  withObservedProjectionPlans,
  type NativeRegionSource,
  projectionGeneration,
  projectionUnitPath,
  projectionUnitPathOfEntry,
  retargetedRegionRows,
  activeInstructionsConfig,
  observeInstructions,
  resolveInstructionsConfig,
  type ProjectionUnitObservation,
  RULES_REGION_OWNER,
} from "@agentxm/workspace-kernel/projection";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import { parseFrontmatterEffect, readExtensionManifest } from "@agentxm/extension-content";
import {
  makeWorkspaceRelativeSourcePath,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  RULE_BODY_FILENAME,
  type RuleManifest,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  assertNoPhysicalOverlap,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";

const RULES_REGION = "rules";

const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

/** The parts of one Rule contributor its region generation is computed from. */
interface RuleRegionContributor {
  readonly name: string;
  readonly marker: string;
  readonly manifest: RuleManifest;
  readonly body: string;
}

/** Input-only generation of the Rules region in one planned target. */
const rulesRegionGeneration = (
  target: string,
  contributors: ReadonlyArray<RuleRegionContributor>,
): Effect.Effect<ProjectionDigest> =>
  projectionGeneration([
    target,
    ...contributors.map((contributor) =>
      stableJson({
        name: contributor.name,
        ref: `${contributor.marker}@${contributor.manifest.version}`,
        body: contributor.body,
        manifest: contributor.manifest,
      }),
    ),
  ]);

/** One Rule's block in the region: an optional title heading and its body. */
const renderRuleBlock = (args: {
  readonly manifest: RuleManifest;
  readonly body: string;
}): string => {
  const header =
    args.manifest.title !== undefined && !args.body.startsWith("#")
      ? `# ${args.manifest.title}\n\n`
      : "";
  return `${header}${args.body}`;
};

const normalizeMarkdown = (content: string): string =>
  content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

export const ruleMaterializationObservation = (
  managedTarget: string,
  instructionItems: ReadonlyArray<{
    readonly agentId: string;
    readonly health: string;
  }>,
): MaterializationObservation => {
  const agents = Array.from(
    new Set(
      instructionItems
        .filter(({ agentId, health }) => health === "ok" && agentId !== "universal")
        .map(({ agentId }) => agentId),
    ),
  );
  return {
    agents,
    targets: [
      {
        path: managedTarget,
        ...(agents.length === 0 ? {} : { agentIds: agents }),
      },
    ],
  };
};

export const RuleManagerLive = Layer.effect(
  RuleManager,
  Effect.gen(function* () {
    const { location, settings, lockfile, desiredState, records, sources, provide, provideRead } =
      yield* captureManagerServices;
    const accepted = yield* AcceptedResolutionWriter;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = location.baseDir;

    // The instructions region is an aggregate unit: it renders after desired
    // state commits, so the closure reads back what the render projected.
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

    /**
     * The package root and its materialized-tree integrity. A workspace
     * package's strict walk also frames its package content hash when
     * `frameContentHash` is set; every other package hashes nothing here.
     */
    const materializePackage = (
      ref: RuleExtensionRef,
      force: boolean,
      nativeInsertionEligible: boolean,
      frameContentHash: boolean,
    ) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          "rules",
          ref.name,
        ).canonicalPath;
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new RuleDefinitionInvalid({ detail }),
          });
          if (!frameContentHash)
            return {
              packageRoot: ref.location,
              treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
              contentHash: Option.none<SourceHash>(),
            };
          const digests = yield* provide(computeMaterializedTreeDigests(ref.location));
          return {
            packageRoot: ref.location,
            treeIntegrity: digests.treeIntegrity,
            contentHash: Option.some(digests.contentHash),
          };
        }
        const acquired = yield* acquireCanonicalForRef({
          ref,
          type: "rule",
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("rule", ref.rule.name),
          force,
          nativeInsertionEligible,
          copyFailure: {
            code: "validation",
            detail: (target) => `Failed to copy rule package files to ${target}`,
          },
        });
        return {
          packageRoot: acquired.packageRoot,
          treeIntegrity: acquired.treeIntegrity,
          contentHash: Option.none<SourceHash>(),
        };
      });

    const readManifest = (packageRoot: string) =>
      readExtensionManifest(packageRoot, "rule").pipe(
        Effect.map(({ manifest }) => manifest),
        Effect.mapError((cause) => new RuleDefinitionInvalid({ detail: cause.detail, cause })),
      );

    /**
     * The instruction source target, read through `phase` when one is current,
     * with the entry its route admission resolved for keying the region row.
     */
    const sourceFileTargetIn = (phase: Effect.Success<ReturnType<typeof workspaceReadPhaseFor>>) =>
      Effect.gen(function* () {
        const config = yield* (phase?.readers.settings ?? settings).instructionsConfig;
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* new RuleDefinitionInvalid({
            detail: `Rule instruction source escapes workspace: ${resolved.fileName}`,
          });
        }
        const { address } = yield* assertNativeMutationWithinRoots(
          nativeAuthorityRoots(
            path,
            { workspaceRoot: baseDir, scope: location.scope },
            location.nativeDirectoryInputs,
          ),
          path.resolve(baseDir, relative.value),
          "content",
          path.dirname(location.runtimeDir),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new RuleDefinitionInvalid({
                detail: `Rule instruction source is not writable: ${relative.value}`,
                cause,
              }),
          ),
        );
        return Object.freeze({
          target: Object.freeze({
            relative: relative.value,
            absolute: address.referentPath ?? address.entryPath,
          }),
          entryPath: address.entryPath,
        });
      });
    const sourceFileTarget = () =>
      workspaceReadPhaseFor(location).pipe(Effect.flatMap(sourceFileTargetIn));
    type SourceFileTarget = Effect.Effect<
      Effect.Success<ReturnType<typeof sourceFileTarget>>,
      Effect.Error<ReturnType<typeof sourceFileTarget>>,
      Effect.Services<ReturnType<typeof sourceFileTarget>>
    >;

    const readRuleBody = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, "src", RULE_BODY_FILENAME)).pipe(
        Effect.flatMap((content) => parseFrontmatterEffect(content)),
        Effect.map((parsed) => normalizeMarkdown(parsed.body)),
        Effect.mapError(
          (error) =>
            new RuleDefinitionInvalid({
              detail: `Failed to read src/${RULE_BODY_FILENAME}`,
              cause: error,
            }),
        ),
      );

    interface RenderedRuleContributor extends RuleRegionContributor {
      readonly root: string;
    }

    const selectRuleContributors = (args: {
      readonly graph: Parameters<typeof activeContributors>[0]["graph"];
      readonly locked: Parameters<typeof activeContributors>[0]["accepted"];
    }) =>
      provideRead(
        activeContributors({
          layout: currentLayout(),
          type: "rule",
          graph: args.graph,
          accepted: args.locked,
          captureManifests: true,
        }),
      ).pipe(
        Effect.flatMap((contributors) =>
          Effect.forEach(
            contributors,
            (contributor) =>
              Effect.gen(function* () {
                // The decode this contributor's observation just made, when it
                // is this package's rule manifest; otherwise the manifest is read.
                const manifest = yield* Option.match(
                  capturedManifestFor(path, contributor.manifest, contributor.packageRoot, "rule"),
                  {
                    onSome: Effect.succeed,
                    onNone: () => readManifest(contributor.packageRoot),
                  },
                );
                const body = yield* readRuleBody(contributor.packageRoot);
                const marker = Option.match(contributor.identityOwner, {
                  onSome: (owner) =>
                    formatFqn({
                      owner,
                      type: "rule",
                      name: decodeExtensionNameSync(contributor.node.name),
                    }),
                  onNone: () =>
                    formatFqn({ owner: manifest.owner, type: "rule", name: manifest.name }),
                });
                return {
                  name: contributor.node.name,
                  marker,
                  manifest,
                  body,
                  root: path.relative(baseDir, contributor.packageRoot),
                };
              }),
            { concurrency: 16 },
          ),
        ),
        Effect.map((resolved) => {
          const sorted = [...resolved].sort((a, b) => {
            const byPriority = (a.manifest.priority ?? 100) - (b.manifest.priority ?? 100);
            if (byPriority !== 0) return byPriority;
            return a.marker.localeCompare(b.marker);
          });
          return sorted;
        }),
      );

    const reconcileRulesRegion = (args: {
      readonly input: ProjectionRenderInput<RenderedRuleContributor>;
      readonly target: { readonly relative: string; readonly absolute: string };
      /**
       * The entry the target's admission just resolved, when this run may key
       * the region row from it; otherwise the key is resolved live.
       */
      readonly admittedEntry?: Effect.Effect<Option.Option<string>>;
      readonly dryRun?: boolean;
      readonly ownership: ReadonlyArray<NativeRegionSource>;
      readonly configuredAgents: ReadonlyArray<string>;
      readonly eligible: boolean;
    }) =>
      Effect.gen(function* () {
        const { target } = args;
        const admitted =
          args.admittedEntry === undefined ? Option.none() : yield* args.admittedEntry;
        const contributors = args.input.contributors;
        const planned = path.resolve(baseDir, target.relative);
        const displayPath = yield* Option.match(admitted, {
          onNone: () => projectionUnitPath(baseDir, planned),
          onSome: (entryPath) => projectionUnitPathOfEntry(baseDir, planned, entryPath),
        });
        const rows = yield* accepted.projectionRows(RULES_REGION);
        const reconciliation = yield* reconcileNativeManagedRegion({
          workspaceRoot: baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          ownerRoot: path.dirname(location.runtimeDir),
          scope: location.scope,
          targetPath: target.absolute,
          displayPath,
          region: RULES_REGION,
          body: contributors.map(renderRuleBlock).join("\n\n"),
          gen: yield* rulesRegionGeneration(displayPath, contributors),
          recorded: Option.fromUndefinedOr(rows.get(displayPath)),
          contributors: contributors.map(({ name, marker, root }) => ({
            name,
            ref: marker,
            root,
            scope: location.scope,
          })),
          ownership: args.ownership,
          configuredAgentIds: args.configuredAgents,
          eligible: args.eligible,
          ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
        });
        const { changed, present } = reconciliation;
        const materializedTarget = decodeMaterializedTarget({
          target: target.relative,
          mode: "managed-region",
          region: RULES_REGION,
        });
        const projectionUnitObservation = {
          nativeLocations: [reconciliation.nativeLocation],
          unitId: "rule:instructions-region",
          path: `${target.relative}#${RULES_REGION}`,
          owner: RULES_REGION_OWNER,
          present,
          current: !changed,
          expectedContributors: contributors.map(({ marker }) => marker),
          ...Option.match(reconciliation.lastWrite, {
            onNone: () => ({}),
            onSome: (lastWrite) => ({ lastWrite }),
          }),
        } satisfies ProjectionUnitObservation;
        if (args.dryRun === true) {
          return {
            materializedTarget,
            materialization: ruleMaterializationObservation(target.relative, []),
            changed,
            projectionUnitObservation,
          };
        }
        yield* accepted.withBatch(
          accepted.stageProjections([
            ...Option.toArray(reconciliation.rowChange),
            ...retargetedRegionRows(RULES_REGION, rows, displayPath),
          ]),
        );

        const instructionItems = yield* provide(
          Effect.gen(function* () {
            const config = yield* activeInstructionsConfig();
            return Option.isSome(config)
              ? (yield* observeInstructions({ config: config.value })).status.items
              : [];
          }),
        );

        const materialization = {
          ...ruleMaterializationObservation(target.relative, instructionItems),
          nativeLocations: [reconciliation.nativeLocation],
        };
        yield* Ref.set(lastProjection, materialization);
        return { materializedTarget, materialization, changed, projectionUnitObservation };
      });

    const makeRulesProjectionPlan = (
      prospective: ReadonlyArray<RenderedRuleContributor> = [],
      options?: NativeProjectionOptions,
      sourceTarget: SourceFileTarget = sourceFileTarget(),
    ) =>
      Effect.gen(function* () {
        const { target, entryPath } = yield* sourceTarget;
        // The admission's entry keys the plan's eager observation, the first
        // dry run its producing call makes; that call releases it when it ends.
        const admittedEntry = yield* Ref.make(Option.some(entryPath));
        const phase = yield* workspaceReadPhaseFor(location);
        const currentSettings = phase?.readers.settings ?? settings;
        const currentLocks = phase?.readers.locks ?? lockfile;
        // A plan that reads desired state live through the reader its output
        // authority reads evaluates once; the authority is derived from that
        // same evaluation in this call.
        const evaluation =
          options?.desiredGraph === undefined &&
          phase === undefined &&
          (yield* DesiredStateReader) === desiredState
            ? Option.some(yield* desiredState.evaluate())
            : Option.none();
        const graph =
          options?.desiredGraph ??
          (Option.isSome(evaluation)
            ? evaluation.value.graph
            : yield* (phase?.readers.desired ?? desiredState).graph());
        const locked = yield* currentLocks.entries("rule");
        const configuredAgents =
          options?.configuredAgents ?? (yield* currentSettings.configuredAgents);
        const accepted = yield* Option.match(evaluation, {
          onNone: () => captureAgentOutputAuthority(),
          onSome: (evaluated) => agentOutputAuthorityFrom(Effect.succeed(evaluated)),
        });
        const ownership = [
          ...accepted.expectedRegions.rule,
          ...(options?.priorAuthority?.expectedRegions.rule ?? []),
          ...prospective.map(({ name, marker, root }) => ({
            name,
            ref: marker,
            root,
            scope: location.scope,
          })),
        ];
        const retained = yield* selectRuleContributors({
          graph: {
            ...graph,
            nodes: graph.nodes.filter(
              (node) => node.type !== "rule" || !prospective.some(({ name }) => name === node.name),
            ),
          },
          locked,
        });
        const contributors = [...retained, ...prospective].sort(
          (left, right) =>
            (left.manifest.priority ?? 100) - (right.manifest.priority ?? 100) ||
            left.marker.localeCompare(right.marker),
        );
        const eligible =
          contributors.some(({ name }) => options?.nativeInsertionEligibleNames?.has(name)) ||
          (configuredAgents.length > 0 &&
            configuredAgents.every((id) => options?.nativeInsertionEligibleAgentIds?.has(id)));
        const plan = yield* planAggregateProjection({
          unitId: "rule:instructions-region",
          targetFile: target.absolute,
          graph,
          // Rule contributors are decided from desired state alone, so the
          // instructions region never excludes one.
          select: () => Effect.succeed({ contributors, exclusions: [] }),
          adapter: {
            observe: (input) =>
              reconcileRulesRegion({
                input,
                target,
                admittedEntry: Ref.getAndSet(admittedEntry, Option.none()),
                ownership,
                configuredAgents,
                eligible,
                dryRun: true,
              }).pipe(Effect.map(({ projectionUnitObservation }) => projectionUnitObservation)),
            apply: (input) =>
              reconcileRulesRegion({ input, target, ownership, configuredAgents, eligible }).pipe(
                Effect.asVoid,
              ),
          },
        });
        return { plan, release: Ref.set(admittedEntry, Option.none()) };
      });

    const regionGeneration: RuleManagerService["regionGeneration"] = Effect.gen(function* () {
      const phase = yield* workspaceReadPhaseFor(location);
      const { target, entryPath } = yield* sourceFileTarget();
      const contributors = yield* selectRuleContributors({
        graph: yield* (phase?.readers.desired ?? desiredState).graph(),
        locked: yield* (phase?.readers.locks ?? lockfile).entries("rule"),
      });
      // Only reads separate the target's admission from its key.
      return yield* rulesRegionGeneration(
        yield* projectionUnitPathOfEntry(
          baseDir,
          path.resolve(baseDir, target.relative),
          entryPath,
        ),
        contributors,
      );
    });

    // Every plan is observed as the pre-write refusal before its consumer runs.
    const observedProjectionPlans: RuleManagerService["observedProjectionPlans"] = (options, use) =>
      makeRulesProjectionPlan([], options).pipe(
        Effect.flatMap(({ plan, release }) =>
          withObservedProjectionPlans([plan], use).pipe(Effect.ensuring(release)),
        ),
      );
    const projectionPlans: RuleManagerService["projectionPlans"] = (options) =>
      observedProjectionPlans(options, (observed) => Effect.succeed(observed.plans));
    const observedPrepareProjection: RuleManagerService["observedPrepareProjection"] = (
      refs,
      options,
      use,
    ) =>
      Effect.gen(function* () {
        // The instruction source target, resolved at this call's first demand,
        // after the first input is fetched, and taken by its later demands
        // while the same read phase, or none, is current.
        const resolved = yield* Ref.make(
          Option.none<{
            readonly phase: Effect.Success<ReturnType<typeof workspaceReadPhaseFor>>;
            readonly target: Effect.Success<SourceFileTarget>;
          }>(),
        );
        const target: SourceFileTarget = Effect.gen(function* () {
          const phase = yield* workspaceReadPhaseFor(location);
          const prior = yield* Ref.get(resolved);
          if (Option.isSome(prior) && prior.value.phase === phase) return prior.value.target;
          const current = yield* sourceFileTargetIn(phase);
          yield* Ref.set(resolved, Option.some({ phase, target: current }));
          return current;
        });
        const prospective = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const source =
                  ref.refType === "registry"
                    ? (yield* sources.fetch(ref)).directory
                    : fromFileLocation(ref.location);
                const nativeTarget = yield* target;
                yield* assertNoPhysicalOverlap(source, nativeTarget.target.absolute).pipe(
                  Effect.mapError(
                    (cause) =>
                      new RuleDefinitionInvalid({
                        detail: "Rule native target overlaps its input source",
                        cause,
                      }),
                  ),
                );
                // The decode the caller made of this same package's rule
                // manifest in this boundary; otherwise the manifest is read.
                const prepared = options?.preparedManifests?.get(ref.rule.name);
                const manifest =
                  prepared !== undefined &&
                  prepared.packageRoot === source &&
                  prepared.manifest.type === "rule"
                    ? prepared.manifest
                    : yield* readManifest(source);
                const body = yield* readRuleBody(source);
                const canonical = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  "rules",
                  ref.rule.name,
                ).canonicalPath;
                return {
                  name: ref.rule.name,
                  marker: formatFqn({ owner: manifest.owner, type: "rule", name: manifest.name }),
                  manifest,
                  body,
                  root: path.relative(baseDir, canonical),
                };
              }),
            ),
          { concurrency: 1 },
        );
        const { plan, release } = yield* makeRulesProjectionPlan(prospective, options, target);
        return yield* withObservedProjectionPlans([plan], use).pipe(Effect.ensuring(release));
      });
    const prepareProjection: RuleManagerService["prepareProjection"] = (refs, options) =>
      observedPrepareProjection(refs, options, (observed) => Effect.succeed(observed.plans));

    const applyRulesProjection = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const materializeInstall: RuleManagerService["materializeInstall"] = Effect.fn(
      "RuleManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible, preparedSourceHash }) {
      // A caller's hash of this exact workspace package root stands for the
      // hash here: nothing in this install writes the package tree. A
      // workspace package's root is its location.
      const preparedHash =
        ref.refType === "workspace" &&
        preparedSourceHash !== undefined &&
        path.resolve(preparedSourceHash.root) === path.resolve(ref.location)
          ? Option.some(preparedSourceHash.hash)
          : Option.none<SourceHash>();
      const materialized = yield* materializePackage(
        ref,
        force === true,
        nativeInsertionEligible === true,
        Option.isNone(preparedHash),
      );
      const packageRoot = materialized.packageRoot;
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? fromFileLocation(ref.location),
            )
          : Option.none<string>();

      // Otherwise a workspace package's strict walk framed the hash; any
      // other package is hashed here.
      const sourceHash = yield* Option.match(
        Option.orElse(preparedHash, () => materialized.contentHash),
        { onSome: Effect.succeed, onNone: () => computePackageContentHash(packageRoot) },
      );
      return {
        observation: NO_MATERIALIZATION_OBSERVATION,
        treeIntegrity: Option.some(materialized.treeIntegrity),
        acquired: Option.some({
          ref,
          workspaceRelativeLocalSourcePath,
          sourceHash,
          treeIntegrity: materialized.treeIntegrity,
        }),
      } satisfies RuleMaterializationFacts;
    });

    // Canonical removal only. The shared operation flow re-renders the region
    // after settings and lock removal, once the target has left the graph.
    const withdrawn: RuleMaterializationFacts = {
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity: Option.none(),
      acquired: Option.none(),
    };
    const materializeUninstall: RuleManagerService["materializeUninstall"] = Effect.fn(
      "RuleManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* provide(
        acceptedCanonicalObservation({
          type: "rule",
          name: target.name,
        }),
      );
      const packageRoot = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packageRoot)) {
        yield* retireCanonicalDirectory(packageRoot.value);
      }
      return withdrawn;
    });
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this rule's contribution.
    const materializeDeactivate: RuleManagerService["materializeDeactivate"] = Effect.fn(
      "RuleManager.materializeDeactivate",
    )(() => applyRulesProjection.pipe(Effect.as(withdrawn)));

    return {
      projectionPlans,
      observedProjectionPlans,
      prepareProjection,
      observedPrepareProjection,
      regionGeneration,
      aggregateProjectionObservation: Ref.get(lastProjection),
      ...makeBaseManagerMembers({
        location,
        type: "rule",
        spanPrefix: "RuleManager",
        records,
        settings,
        refName: (ref) => ref.rule.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: materializeInstall,

      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: () =>
        listMaterializableFromAccepted({
          type: "rule",
          names: workspaceReadPhaseFor(location)
            .pipe(Effect.flatMap((phase) => (phase?.readers.settings ?? settings).entries("rule")))
            .pipe(
              Effect.map((configured) =>
                enabledConfiguredEntries(configured).map(([name]) => name),
              ),
            ),
        }),

      materializeUninstall,
      materializeDeactivate,

      acceptedResolution: ({ ref, materialization }) =>
        acceptedResolutionFor({
          ref,
          acquired: Option.flatMap(materialization, (facts) => facts.acquired),
        }),
    } satisfies RuleManagerService;
  }),
);
