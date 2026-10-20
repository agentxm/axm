/** Deterministic Knowledge discovery table reconciliation. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  ProjectionTargetUnsupported,
  ProjectionIoFailed,
  type ManagedRegionFailure,
} from "../errors.js";
import { projectionGeneration } from "../generation.js";
import { projectionUnitPath } from "../unit-path.js";
import {
  reconcileNativeManagedRegion,
  retargetedRegionRows,
  type NativeRegionSource,
  type ProjectionLastWrite,
} from "../native-managed-region.js";
import type { WorkspaceSnapshotError } from "../../settlement/index.js";
import { NativeWriteAuthority, type NativeWriteRefused } from "../../agent-adapters/index.js";
import {
  resolveNativeReadLocation,
  resolveNativeReferent,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  stableJson,
  type ProjectionDigest,
  type ProjectionRowChange,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
  type ResolvedKnowledgeDiscoveryConfig,
} from "../../workspace-state/index.js";

const KNOWLEDGE_REGION = "knowledge";

export interface KnowledgeDiscoveryBundle {
  readonly owner: string;
  readonly name: string;
  readonly sourceDir: string;
  readonly description?: string;
}

interface KnowledgeDiscoveryArtifact {
  readonly path: string;
  readonly change: "created" | "updated" | "removed" | "unchanged";
  readonly mechanism?: "symlink" | "copy";
}

export interface KnowledgeDiscoveryResult {
  readonly changed: boolean;
  readonly artifacts: ReadonlyArray<KnowledgeDiscoveryArtifact>;
  /** The region was complete in the planned target before this reconciliation. */
  readonly present: boolean;
  readonly lastWrite: Option.Option<ProjectionLastWrite>;
  /**
   * Rows to stage when applying: the planned target's row change and the
   * withdrawal of any row recorded for a previous target.
   */
  readonly rowChanges: ReadonlyArray<ProjectionRowChange>;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
}

const portable = (value: string): string => value.replaceAll("\\", "/");

const normalizeCell = (value: string | undefined): string => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (normalized === undefined || normalized.length === 0) return "—";
  return normalized.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
};

const escapeLinkLabel = (value: string): string =>
  normalizeCell(value).replaceAll("[", "\\[").replaceAll("]", "\\]");

const renderKnowledgeBaseTable = (args: {
  readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
  readonly instructionsPath: string;
  readonly path: Path.Path;
}): string => {
  const bundles = [...args.bundles].sort(
    (left, right) => left.owner.localeCompare(right.owner) || left.name.localeCompare(right.name),
  );
  const owners = new Map<string, Array<KnowledgeDiscoveryBundle>>();
  for (const bundle of bundles) {
    const owned = owners.get(bundle.owner) ?? [];
    owned.push(bundle);
    owners.set(bundle.owner, owned);
  }
  const sections = [...owners].map(([owner, owned]) => {
    const rows = owned.map((bundle) => {
      const target = args.path.join(bundle.sourceDir, "index.md");
      const relative = portable(
        args.path.relative(args.path.dirname(args.instructionsPath), target),
      );
      const name = escapeLinkLabel(bundle.name);
      return `| [${name}](${relative}) | ${normalizeCell(bundle.description)} |`;
    });
    return [
      `### ${escapeLinkLabel(owner)}`,
      "",
      "| Bundle | Description |",
      "| --- | --- |",
      ...rows,
    ].join("\n");
  });
  return [
    "## Knowledge Bundles",
    "Use `axm knowledge concepts --help` to search, read, and explore these bundles.",
    ...sections,
  ].join("\n\n");
};

/** A relative link can be shared only when each native route has the same base. */
const validateKnowledgeLinkBases = (args: {
  readonly scopeRoot: string;
  readonly scope: "project" | "user";
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly instructionsPath: string;
  readonly instructionsDeclaredPath: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const source = yield* resolveNativeReferent(args.instructionsPath);
    const sourceParent = path.dirname(source);
    const declaredParent = yield* resolveNativeReferent(
      path.dirname(args.instructionsDeclaredPath),
    );
    if (declaredParent !== sourceParent)
      return yield* new ProjectionTargetUnsupported({
        detail:
          "Knowledge relative links cannot be shared through an instruction source alias with a different parent; native link-resolution semantics are unverified.",
      });
    for (const agent of AGENTS) {
      if (!args.configuredAgentIds.includes(agent.id)) continue;
      const native = agent.instructions.native;
      if (!("locations" in native)) continue;
      for (const declaration of native.locations) {
        if (declaration.shape !== "file" || declaration.scope !== args.scope) continue;
        const resolved = resolveNativeReadLocation(
          path,
          agent.id,
          declaration,
          { workspaceRoot: args.scopeRoot, scope: args.scope },
          args.nativeDirectoryInputs,
          { includeConditional: true },
        );
        if (resolved === undefined) continue;
        if (declaration.role !== "primary" || declaration.applicability.kind !== "always") {
          const referent = yield* resolveNativeReferent(resolved.path);
          if (referent !== source) continue;
        }
        const readerParent = yield* resolveNativeReferent(path.dirname(resolved.path));
        if (readerParent !== sourceParent)
          return yield* new ProjectionTargetUnsupported({
            detail: `Knowledge relative links cannot be shared with ${agent.id} at ${resolved.path}: its native instruction parent differs from the source and link-resolution semantics are unverified.`,
          });
      }
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ProjectionTargetUnsupported
        ? cause
        : new ProjectionIoFailed({ path: args.instructionsDeclaredPath, step: "inspect", cause }),
    ),
  );

const sortedBundles = (bundles: ReadonlyArray<KnowledgeDiscoveryBundle>) =>
  [...bundles].sort(
    (left, right) => left.owner.localeCompare(right.owner) || left.name.localeCompare(right.name),
  );

/**
 * Input-only generation of the Knowledge region in one planned target. Bundle
 * locations are hashed relative to the scope root, so the generation is the
 * same in every checkout of the workspace.
 */
export const knowledgeRegionGeneration = (args: {
  readonly target: string;
  readonly scopeRoot: string;
  readonly path: Path.Path;
  readonly config: ResolvedKnowledgeDiscoveryConfig;
  readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
}): ProjectionDigest =>
  projectionGeneration([
    args.target,
    stableJson(args.config),
    ...sortedBundles(args.bundles).map((bundle) =>
      stableJson({
        owner: bundle.owner,
        name: bundle.name,
        sourceDir: portable(args.path.relative(args.scopeRoot, bundle.sourceDir)),
        description: bundle.description ?? "",
      }),
    ),
  ]);

export const reconcileKnowledgeDiscovery = (args: {
  readonly scopeRoot: string;
  readonly ownerRoot: string;
  readonly scope: "project" | "user";
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly ownership: ReadonlyArray<NativeRegionSource>;
  readonly eligible: boolean;
  readonly config: ResolvedKnowledgeDiscoveryConfig;
  readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
  readonly instructionsPath: string;
  readonly instructionsDeclaredPath: string;
  /** Recorded `knowledge` rows, keyed by planned target. */
  readonly recorded: ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>;
  readonly instructionManagementEnabled?: boolean;
  readonly dryRun?: boolean;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<
  KnowledgeDiscoveryResult,
  ManagedRegionFailure | WorkspaceSnapshotError | NativeWriteRefused,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const manageInstructions = args.instructionManagementEnabled === true;
    if (!manageInstructions) {
      return {
        changed: false,
        artifacts: [],
        present: false,
        lastWrite: Option.none(),
        rowChanges: [],
        nativeLocations: [],
      };
    }
    const tableDesired = manageInstructions && args.config.instructions && args.bundles.length > 0;
    if (tableDesired) yield* validateKnowledgeLinkBases(args);
    const instructionRelative = yield* projectionUnitPath(
      args.scopeRoot,
      args.instructionsDeclaredPath,
    );
    const renderedRegion = tableDesired
      ? renderKnowledgeBaseTable({
          bundles: args.bundles,
          instructionsPath: args.instructionsPath,
          path,
        })
      : "";
    const reconciliation = yield* reconcileNativeManagedRegion({
      workspaceRoot: args.scopeRoot,
      ownerRoot: args.ownerRoot,
      scope: args.scope,
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      targetPath: args.instructionsPath,
      displayPath: instructionRelative,
      region: KNOWLEDGE_REGION,
      body: renderedRegion,
      gen: knowledgeRegionGeneration({
        target: instructionRelative,
        scopeRoot: args.scopeRoot,
        path,
        config: args.config,
        bundles: args.bundles,
      }),
      recorded: Option.fromUndefinedOr(args.recorded.get(instructionRelative)),
      ownership: args.ownership,
      contributors: args.bundles.map(({ name, owner, sourceDir }) => ({
        name,
        ref: `${owner}/knowledge/${name}`,
        root: path.relative(args.scopeRoot, path.dirname(sourceDir)),
        scope: args.scope,
      })),
      configuredAgentIds: args.configuredAgentIds,
      eligible: args.eligible,
      ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
    });
    const instructionsChanged = reconciliation.changed;
    const artifacts: Array<KnowledgeDiscoveryArtifact> = [];
    if (instructionsChanged) {
      artifacts.push({
        path: instructionRelative,
        change: !reconciliation.existed
          ? "created"
          : renderedRegion.length === 0
            ? "removed"
            : "updated",
      });
    }
    const changed = artifacts.length > 0;
    return {
      changed,
      artifacts,
      present: reconciliation.present,
      lastWrite: reconciliation.lastWrite,
      rowChanges: [
        ...Option.toArray(reconciliation.rowChange),
        ...retargetedRegionRows(KNOWLEDGE_REGION, args.recorded, instructionRelative),
      ],
      nativeLocations: [reconciliation.nativeLocation],
    };
  });
