/** Deterministic Knowledge discovery table reconciliation. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { reconcileManagedRegionFile } from "../projection/managed-region-adapter.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "./discovery-config.js";

const KNOWLEDGE_REGION = "knowledge-base";

export interface KnowledgeDiscoveryBundle {
  readonly owner: string;
  readonly name: string;
  readonly sourceDir: string;
  readonly description?: string;
}

export interface KnowledgeDiscoveryArtifact {
  readonly path: string;
  readonly change: "created" | "updated" | "removed" | "unchanged";
  readonly mechanism?: "symlink" | "copy";
}

export interface KnowledgeDiscoveryResult {
  readonly changed: boolean;
  readonly artifacts: ReadonlyArray<KnowledgeDiscoveryArtifact>;
}

const portable = (value: string): string => value.replaceAll("\\", "/");

const normalizeCell = (value: string | undefined): string => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (normalized === undefined || normalized.length === 0) return "—";
  return normalized.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
};

const escapeLinkLabel = (value: string): string =>
  normalizeCell(value).replaceAll("[", "\\[").replaceAll("]", "\\]");

export const renderKnowledgeBaseTable = (args: {
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
  return ["## Knowledge Base", ...sections].join("\n\n");
};

export const reconcileKnowledgeDiscovery = (args: {
  readonly scopeRoot: string;
  readonly config: ResolvedKnowledgeDiscoveryConfig;
  readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
  readonly instructionsPath: string;
  readonly instructionManagementEnabled?: boolean;
  readonly preserveInstructionsSource?: boolean;
  readonly dryRun?: boolean;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<KnowledgeDiscoveryResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const manageInstructions = args.instructionManagementEnabled === true;
    if (!manageInstructions) return { changed: false, artifacts: [] };
    const tableDesired = manageInstructions && args.config.instructions && args.bundles.length > 0;
    const instructionRelative = portable(path.relative(args.scopeRoot, args.instructionsPath));
    const renderedRegion = tableDesired
      ? renderKnowledgeBaseTable({
          bundles: args.bundles,
          instructionsPath: args.instructionsPath,
          path,
        })
      : "";
    const reconciliation = yield* reconcileManagedRegionFile({
      targetPath: args.instructionsPath,
      displayPath: instructionRelative,
      region: KNOWLEDGE_REGION,
      rendered: renderedRegion,
      ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
      removeEmptyFile: true,
      preserveEmptyFile: args.preserveInstructionsSource === true,
      unsupportedTargetDetail: `Knowledge discovery target does not support managed regions: ${instructionRelative}`,
    });
    const instructionsChanged = reconciliation.changed;
    const artifacts: Array<KnowledgeDiscoveryArtifact> = [];
    if (instructionsChanged) {
      artifacts.push({
        path: instructionRelative,
        change: !reconciliation.existed
          ? "created"
          : reconciliation.updated.trim().length === 0
            ? "removed"
            : "updated",
      });
    }
    const changed = artifacts.length > 0;
    return { changed, artifacts };
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "AppError"
        ? cause
        : makeAppError({
            code: "internal",
            detail: "Failed to reconcile Knowledge discovery",
            cause,
          }),
    ),
  );
