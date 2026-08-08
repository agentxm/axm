/** Deterministic Knowledge discovery table and legacy projection migration. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "./discovery-config.js";
import { protectWorkspacePath } from "../workspace/transaction.js";

export const KNOWLEDGE_MATERIALIZATION_STATE = "knowledge-materialization.json";
const KNOWLEDGE_REGION = "knowledge-base";
const LEGACY_DISCOVERY_REGION = "knowledge-discovery";

const LegacyArtifactSchema = Schema.Struct({ path: Schema.String });
const LegacyStateSchema = Schema.Struct({
  root: Schema.String,
  indexPath: Schema.optionalKey(Schema.String),
  artifacts: Schema.Array(LegacyArtifactSchema),
});

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

const containedPath = (path: Path.Path, root: string, relative: string): Option.Option<string> => {
  if (path.isAbsolute(relative)) return Option.none();
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relative);
  const fromRoot = path.relative(resolvedRoot, resolved);
  if (
    fromRoot.length === 0 ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromRoot)
  ) {
    return Option.none();
  }
  return Option.some(resolved);
};

const removeEmptyParents = (start: string, stop: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = start;
    while (current !== stop && current.startsWith(`${stop}${path.sep}`)) {
      const entries = yield* fs.readDirectory(current).pipe(Effect.option);
      if (Option.isNone(entries) || entries.value.length > 0) return;
      yield* fs.remove(current).pipe(Effect.ignore);
      current = path.dirname(current);
    }
  });

const legacyManagedPaths = (args: {
  readonly scopeRoot: string;
  readonly statePath: string;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}) =>
  Effect.gen(function* () {
    const raw = yield* readOptional(args.fs, args.statePath);
    if (Option.isNone(raw)) return [];
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw.value),
      catch: (cause) =>
        makeAppError({ code: "validation", detail: "Invalid legacy Knowledge state", cause }),
    }).pipe(Effect.result);
    if (Result.isFailure(parsed)) return [];
    const decoded = Schema.decodeUnknownResult(LegacyStateSchema)(parsed.success);
    if (Result.isFailure(decoded)) return [];
    const candidates = [
      ...decoded.success.artifacts.map((artifact) => artifact.path),
      ...(decoded.success.indexPath === undefined ? [] : [decoded.success.indexPath]),
    ];
    return candidates.flatMap((candidate) =>
      Option.match(containedPath(args.path, args.scopeRoot, candidate), {
        onNone: () => [],
        onSome: (value) => [value],
      }),
    );
  });

export const reconcileKnowledgeDiscovery = (args: {
  readonly scopeRoot: string;
  readonly axmDir: string;
  readonly config: ResolvedKnowledgeDiscoveryConfig;
  readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
  readonly instructionsPath: string;
  readonly instructionManagementEnabled?: boolean;
  readonly preserveInstructionsSource?: boolean;
  readonly dryRun?: boolean;
  readonly preserveBundleNames?: ReadonlySet<string>;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<KnowledgeDiscoveryResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const statePath = path.join(args.axmDir, ".local", KNOWLEDGE_MATERIALIZATION_STATE);
    const oldPaths = yield* legacyManagedPaths({
      scopeRoot: args.scopeRoot,
      statePath,
      fs,
      path,
    });
    const stateExists = yield* fs.exists(statePath);
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
    const withoutLegacy =
      manageInstructions && Option.isSome(style)
        ? stripManagedRegion(body, { region: LEGACY_DISCOVERY_REGION }, style.value)
        : body;
    const rendered =
      !manageInstructions || Option.isNone(style)
        ? body
        : tableDesired
          ? replaceManagedRegion({
              content: withoutLegacy,
              marker: { region: KNOWLEDGE_REGION },
              rendered: renderKnowledgeBaseTable({
                bundles: args.bundles,
                instructionsPath: args.instructionsPath,
                path,
              }),
              style: style.value,
            })
          : stripManagedRegion(withoutLegacy, { region: KNOWLEDGE_REGION }, style.value);
    const instructionsChanged = rendered !== body;
    const mayMigrate =
      manageInstructions && (!tableDesired || !instructionsChanged || rendered.length > 0);
    const removals = mayMigrate ? oldPaths : [];
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
    for (const removal of removals) {
      if (yield* fs.exists(removal)) {
        artifacts.push({
          path: portable(path.relative(args.scopeRoot, removal)),
          change: "removed",
        });
      }
    }
    if (stateExists && mayMigrate) {
      artifacts.push({
        path: portable(path.relative(args.scopeRoot, statePath)),
        change: "removed",
      });
    }
    const changed = artifacts.length > 0;
    if (!changed || args.dryRun === true) return { changed, artifacts };

    // The replacement instruction table is committed before obsolete managed
    // projection artifacts are touched.
    if (instructionsChanged) {
      yield* protectWorkspacePath(args.instructionsPath);
      if (rendered.trim().length === 0 && args.preserveInstructionsSource !== true) {
        yield* fs.remove(args.instructionsPath, { force: true });
      } else {
        yield* fs.makeDirectory(path.dirname(args.instructionsPath), { recursive: true });
        yield* fs.writeFileString(args.instructionsPath, rendered);
      }
    }

    for (const removal of removals) {
      yield* protectWorkspacePath(removal);
      yield* fs.remove(removal, { recursive: true, force: true });
      yield* removeEmptyParents(path.dirname(removal), args.scopeRoot);
    }
    if (stateExists && mayMigrate) {
      yield* protectWorkspacePath(statePath);
      yield* fs.remove(statePath, { force: true });
      yield* removeEmptyParents(path.dirname(statePath), args.axmDir);
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
