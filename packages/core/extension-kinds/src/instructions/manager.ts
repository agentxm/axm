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
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  enabledConfiguredEntries,
  computeExtensionPathsForLayout,
  computePackageContentHash,
  computeMaterializedTreeIntegrity,
  MaterializedFileTargetSchema,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
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
  observeProjectionPlans,
  type NativeRegionSource,
  projectionGeneration,
  activeInstructionsConfig,
  observeInstructions,
  resolveInstructionsConfig,
  type ProjectionUnitObservation,
  RULES_REGION_OWNER,
} from "@agentxm/workspace-kernel/projection";
import {
  MARKER_KIND_POINT,
  MARKER_VERSION,
  serializeMarker,
} from "@agentxm/workspace-kernel/agent-adapters";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import { parseFrontmatterEffect } from "@agentxm/extension-content";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import {
  makeWorkspaceRelativeSourcePath,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type RuleManifest,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import {
  assertNoPhysicalOverlap,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";

const RULES_REGION = "rules";

const decodeRuleManifest = Schema.decodeUnknownEffect(RuleManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

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

    // The instructions region is an aggregate unit: it renders after desired
    // state commits, so the closure reads back what the render projected.
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

    const materializePackage = (
      ref: RuleExtensionRef,
      force = false,
      nativeInsertionEligible = false,
    ) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          RULE_EXTENSION_DIR,
          ref.name,
        ).canonicalPath;
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new RuleDefinitionInvalid({ detail }),
          });
          return {
            packageRoot: ref.location,
            treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
          };
        }
        return yield* acquireCanonicalForRef({
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
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, RULE_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              new RuleDefinitionInvalid({
                detail: `Failed to parse ${RULE_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeRuleManifest(content)),
        Effect.mapError(
          (error) =>
            new RuleDefinitionInvalid({
              detail: `Failed to read ${RULE_MANIFEST_FILENAME}`,
              cause: error,
            }),
        ),
      );

    const sourceFileTarget = () =>
      Effect.gen(function* () {
        const config = yield* settings.instructionsConfig;
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
        return {
          relative: relative.value,
          absolute: address.referentPath ?? address.entryPath,
        };
      });

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

    const renderRuleBlock = (args: {
      readonly marker: string;
      readonly manifest: RuleManifest;
      readonly body: string;
    }): string => {
      const header =
        args.manifest.title !== undefined && !args.body.startsWith("#")
          ? `# ${args.manifest.title}\n\n`
          : "";
      const marker = serializeMarker(
        {
          kind: MARKER_KIND_POINT,
          v: MARKER_VERSION,
          pointKind: "rule",
          ext: `${args.marker}@${args.manifest.version}`,
        },
        { kind: "block", open: "<!--", close: "-->" },
      );
      return `${marker}\n\n${header}${args.body}`;
    };

    interface RenderedRuleContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: RuleManifest;
      readonly body: string;
      readonly root: string;
    }

    const selectRuleContributors = (args: {
      readonly graph: Parameters<typeof activeContributors>[0]["graph"];
      readonly locked: Parameters<typeof activeContributors>[0]["accepted"];
    }) =>
      provide(
        activeContributors({
          layout: currentLayout(),
          type: "rule",
          graph: args.graph,
          accepted: args.locked,
        }),
      ).pipe(
        Effect.flatMap((contributors) =>
          Effect.forEach(
            contributors,
            (contributor) =>
              Effect.gen(function* () {
                const manifest = yield* readManifest(contributor.packageRoot);
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
      readonly dryRun?: boolean;
      readonly ownership: ReadonlyArray<NativeRegionSource>;
      readonly configuredAgents: ReadonlyArray<string>;
      readonly eligible: boolean;
    }) =>
      Effect.gen(function* () {
        const { target } = args;
        const contributors = args.input.contributors;
        const rendered = contributors.map(renderRuleBlock).join("\n\n");
        const generation = projectionGeneration([
          "rule-instructions-region-v1",
          target.relative,
          RULES_REGION_OWNER,
          ...contributors.flatMap((contributor) => [
            contributor.name,
            contributor.marker,
            contributor.body,
            JSON.stringify(contributor.manifest),
          ]),
        ]);
        const reconciliation = yield* reconcileNativeManagedRegion({
          workspaceRoot: baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          ownerRoot: path.dirname(location.runtimeDir),
          scope: location.scope,
          targetPath: target.absolute,
          displayPath: target.relative,
          region: RULES_REGION,
          owner: RULES_REGION_OWNER,
          rendered,
          generation,
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
        const { changed, observedRegion } = reconciliation;
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
          present: Option.isSome(observedRegion),
          current: !changed,
          expectedContributors: contributors.map(({ marker }) => marker),
        } satisfies ProjectionUnitObservation;
        if (args.dryRun === true) {
          return {
            materializedTarget,
            materialization: ruleMaterializationObservation(target.relative, []),
            changed,
            projectionUnitObservation,
          };
        }

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
    ) =>
      Effect.gen(function* () {
        const target = yield* sourceFileTarget();
        const graph = options?.desiredGraph ?? (yield* desiredState.graph());
        const locked = yield* lockfile.entries("rule");
        const configuredAgents = options?.configuredAgents ?? (yield* settings.configuredAgents);
        const accepted = yield* captureAgentOutputAuthority();
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
        yield* observeProjectionPlans([plan]);
        return plan;
      });

    const projectionPlans: RuleManagerService["projectionPlans"] = (options) =>
      makeRulesProjectionPlan([], options).pipe(Effect.map((plan) => [plan]));
    const prepareProjection: RuleManagerService["prepareProjection"] = (refs, options) =>
      Effect.gen(function* () {
        const prospective = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const source =
                  ref.refType === "registry"
                    ? (yield* sources.fetch(ref)).directory
                    : fromFileLocation(ref.location);
                const nativeTarget = yield* sourceFileTarget();
                yield* assertNoPhysicalOverlap(source, nativeTarget.absolute).pipe(
                  Effect.mapError(
                    (cause) =>
                      new RuleDefinitionInvalid({
                        detail: "Rule native target overlaps its input source",
                        cause,
                      }),
                  ),
                );
                const manifest = yield* readManifest(source);
                const body = yield* readRuleBody(source);
                const canonical = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  RULE_EXTENSION_DIR,
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
        return [yield* makeRulesProjectionPlan(prospective, options)];
      });

    const applyRulesProjection = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const materializeInstall: RuleManagerService["materializeInstall"] = Effect.fn(
      "RuleManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible }) {
      const materialized = yield* materializePackage(ref, force === true, nativeInsertionEligible);
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
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* new RuleDefinitionInvalid({
          detail: `Local rule source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* computePackageContentHash(packageRoot);
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
      prepareProjection,
      aggregateProjectionObservation: Ref.get(lastProjection),
      ...makeBaseManagerMembers({
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
          names: settings
            .entries("rule")
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

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies RuleManagerService;
  }),
);
