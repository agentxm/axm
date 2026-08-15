/** Deterministic Knowledge discovery table reconciliation. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "./discovery-config.js";
import { protectWorkspacePath } from "../workspace/transaction.js";

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

const readOptional = (fs: FileSystem.FileSystem, file: string) =>
  fs.readFileString(file).pipe(Effect.option);

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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manageInstructions = args.instructionManagementEnabled === true;
    const tableDesired = manageInstructions && args.config.instructions && args.bundles.length > 0;
    const instructionRelative = portable(path.relative(args.scopeRoot, args.instructionsPath));
    const style = commentStyleForTarget(instructionRelative);
    if (manageInstructions && Option.isNone(style)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Knowledge discovery target does not support managed regions: ${instructionRelative}`,
      });
    }

    const existing = yield* readOptional(fs, args.instructionsPath);
    const body = Option.getOrElse(existing, () => "");
    const rendered =
      !manageInstructions || Option.isNone(style)
        ? body
        : tableDesired
          ? replaceManagedRegion({
              content: body,
              marker: { region: KNOWLEDGE_REGION },
              rendered: renderKnowledgeBaseTable({
                bundles: args.bundles,
                instructionsPath: args.instructionsPath,
                path,
              }),
              style: style.value,
            })
          : stripManagedRegion(body, { region: KNOWLEDGE_REGION }, style.value);
    const instructionsChanged = rendered !== body;
    const artifacts: Array<KnowledgeDiscoveryArtifact> = [];
    if (instructionsChanged) {
      artifacts.push({
        path: instructionRelative,
        change: Option.isNone(existing)
          ? "created"
          : rendered.trim().length === 0
            ? "removed"
            : "updated",
      });
    }
    const changed = artifacts.length > 0;
    if (!changed || args.dryRun === true) return { changed, artifacts };

    if (instructionsChanged) {
      yield* protectWorkspacePath(args.instructionsPath);
      if (rendered.trim().length === 0 && args.preserveInstructionsSource !== true) {
        yield* fs.remove(args.instructionsPath, { force: true });
      } else {
        yield* fs.makeDirectory(path.dirname(args.instructionsPath), { recursive: true });
        yield* fs.writeFileString(args.instructionsPath, rendered);
      }
    }

    return { changed: true, artifacts };
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
