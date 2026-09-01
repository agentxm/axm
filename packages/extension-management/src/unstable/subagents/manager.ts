/**
 * Subagent extension manager service.
 *
 * Implements ExtensionManager<SubagentExtensionRef> with canonical source
 * materialization, per-agent rendering via CodingAgent.addSubagent(),
 * and source-hash-based skip logic.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import type { SubagentExtensionRef, RegistrySubagentRef } from "../workspace/refs/subagent.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  MaterializationObservation,
  SubagentExtensionTarget,
} from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  CodingAgentRepository,
  renderManagedSubagentOutputs,
  type SubagentSyncOutcome,
} from "../agents/index.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import { sanitizeName } from "../workspace/extension-name.js";
import { stripFileProtocol } from "../utils/index.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "../workspace/remove-if-exists.js";
import {
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
} from "./paths.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../workspace/materialized-tree.js";
import type { SubagentPathSource } from "./paths.js";
import { parseSubagentMd } from "@agentxm/registry-protocol/unstable/content/subagent-content";
import { subagentContentErrorToAppError } from "../app-error/conversions.js";
import { warnOnOrphanOverrides } from "./rendering/overrides.js";
import { buildRooModeEntry } from "./rendering/index.js";
import { configuredSubagentsToDiskRefs } from "../extensions/materializable-from-disk.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { buildSubagentLockEntry } from "./lock-entry-builder.js";
import {
  canReuseInstalledPackage,
  insertManagedFileBanner,
  materializeExternalPackageWithTreeIntegrity,
  materializeRegistryPackageWithTreeIntegrity,
  type ManagedFileProvenance,
} from "../extensions/index.js";
import { computePackageContentHash } from "../workspace/package-hash.js";
import {
  computeSourceHash,
  RenderedFilePathSchema,
  type SourceHash,
} from "../workspace/rendered-files.js";
import {
  MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import {
  findManagedSubagentFiles,
  hasAxmManagedMarker,
} from "../workspace/rendered-file-cleanup.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../workspace/accepted-canonical-ref.js";
import {
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "../projection/planning.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { managedSubagentFile } from "./managed-file.js";

const decodeSubagentManifest = Schema.decodeUnknownSync(SubagentManifestSchema);
const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

const parseRooModes = (content: string): ReadonlyArray<Readonly<Record<string, unknown>>> => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || !("customModes" in parsed)) return [];
    const customModes = parsed.customModes;
    if (!Array.isArray(customModes)) return [];
    return customModes.filter(
      (mode): mode is Readonly<Record<string, unknown>> =>
        typeof mode === "object" && mode !== null && !Array.isArray(mode),
    );
  } catch {
    return [];
  }
};

/**
 * Strip the meta-only `agentOverrides` key from a frontmatter map so it does
 * not leak into rendered files. The map is treated as opaque otherwise.
 */
const stripAgentOverrides = (
  fm: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  if (!("agentOverrides" in fm)) return fm;
  const { agentOverrides: _agentOverrides, ...rest } = fm;
  return rest;
};

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export interface SubagentManagerService extends ExtensionManager<SubagentExtensionRef> {
  readonly projectionObservation: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<
    { readonly present: boolean; readonly current: boolean },
    ReturnType<typeof makeAppError>
  >;
}

export class SubagentManager extends ServiceMap.Service<SubagentManager, SubagentManagerService>()(
  "@agentxm/extension-management/unstable/subagents/manager/SubagentManager",
) {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);
    const roleSkillContent = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly body: string;
      readonly description: string;
      readonly managedFile: ManagedFileProvenance;
    }) =>
      insertManagedFileBanner(
        `---\nname: ${args.name}\ndescription: ${args.description}\n---\n\n# ${args.name} role\n\nAdopt this role for the current task. This is an advisory role-skill fallback because ${args.agentId} has no native subagent surface.\n\n${args.body.trim()}\n`,
        {
          ...args.managedFile,
          helpTopic: "subagents",
          format: "markdown",
        },
      );
    const jsonValuesEqual = (left: unknown, right: unknown): boolean => {
      if (left === right) return true;
      if (Array.isArray(left) && Array.isArray(right)) {
        return (
          left.length === right.length &&
          left.every((value, index) => jsonValuesEqual(value, right[index]))
        );
      }
      if (
        typeof left === "object" &&
        left !== null &&
        !Array.isArray(left) &&
        typeof right === "object" &&
        right !== null &&
        !Array.isArray(right)
      ) {
        const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
        const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
        return (
          leftEntries.length === rightEntries.length &&
          leftEntries.every(
            ([key, value], index) =>
              key === rightEntries[index]?.[0] && jsonValuesEqual(value, rightEntries[index]?.[1]),
          )
        );
      }
      return false;
    };

    const materializeRoleSkillFallback = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly sanitized: string;
      readonly body: string;
      readonly description: string;
      readonly targetDir: string;
      readonly managedFile: ManagedFileProvenance;
    }): Effect.Effect<SubagentSyncOutcome, ReturnType<typeof makeAppError>> =>
      Effect.gen(function* () {
        const polyfillHash = computeSourceHash(
          JSON.stringify({ agent: args.agentId, name: args.name, body: args.body }),
        );
        const polyfillDir = path.join(
          baseDir,
          ".axm",
          "build",
          "polyfills",
          "subagents",
          args.sanitized,
          polyfillHash,
        );
        const skillMdPath = path.join(polyfillDir, "SKILL.md");
        const skillContent = roleSkillContent(args);
        yield* protectWorkspacePath(polyfillDir);
        yield* fs.makeDirectory(polyfillDir, { recursive: true });
        const current = yield* fs.readFileString(skillMdPath).pipe(Effect.option);
        if (Option.isNone(current) || current.value !== skillContent) {
          yield* fs.writeFileString(skillMdPath, skillContent);
        }
        const targetPath = path.join(path.normalize(args.targetDir), args.sanitized);
        yield* protectWorkspacePath(targetPath);
        yield* fs.remove(targetPath, { recursive: true, force: true });
        yield* provide(
          copyExtensionDirectory(polyfillDir, targetPath, {
            forAgentArtifact: true,
          }),
        );
        yield* Effect.logWarning(
          `Degraded subagent ${args.name} to a role skill for ${args.agentId}`,
        );
        return {
          _tag: "success",
          renderedFilePaths: [targetPath],
          warnings: [`Degraded subagent ${args.name} to a role skill for ${args.agentId}`],
        } satisfies SubagentSyncOutcome;
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "AppError"
            ? cause
            : makeAppError({
                code: "internal",
                detail: `Failed to materialize subagent fallback for ${args.agentId}`,
                cause,
              }),
        ),
      );
    const lastInstallState = new Map<
      string,
      {
        readonly sourceHash: SourceHash;
        readonly treeIntegrity: TreeIntegrity;
        readonly materialization: MaterializationObservation;
      }
    >();
    const lastUninstallState = new Map<string, MaterializationObservation>();

    // Compute canonical paths for a subagent ref
    const getCanonicalPaths = (ref: SubagentExtensionRef) => {
      const sanitized = sanitizeName(ref.subagent.name);
      const source: SubagentPathSource = ref;
      const paths = computeSubagentPathsForLayout(path.join, ws.layout, source, sanitized);
      return { sanitized, paths };
    };

    // Read and parse subagent content from canonical source
    const readSubagentContent = (subagentSrcPath: string, name: string) =>
      Effect.gen(function* () {
        const expectedFilename = subagentContentFilename(name);
        const contentPath = subagentContentPath(path.join, subagentSrcPath, name);
        const rawContent = yield* fs.readFileString(contentPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read ${expectedFilename} from ${subagentSrcPath}`,
              suggestions: [
                {
                  description: `Ensure the subagent content file exists at ${contentPath}.`,
                },
              ],
              cause: error,
            }),
          ),
        );
        const parsed = yield* parseSubagentMd(rawContent, name).pipe(
          Effect.mapError(subagentContentErrorToAppError),
        );
        return { rawContent, parsed };
      });

    // Copy source to canonical location
    const copyToCanonical = (sourcePath: string, targetPath: string) =>
      provide(
        materializeExternalPackageWithTreeIntegrity({
          baseDir,
          canonicalPath: targetPath,
          sourceLocation: sourcePath,
          copyFailureCode: "internal",
          copyFailureDetail: (target) => `Failed to copy subagent files to ${target}`,
        }),
      );

    // Materialize from registry
    const materializeFromRegistry = (
      ref: RegistrySubagentRef,
      canonicalPath: string,
      force: boolean,
    ) =>
      Effect.gen(function* () {
        const lockedEntry = yield* ws.getLockedSubagent(ref.subagent.name);
        const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
        const useExisting = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force,
            refVersion: ref.version,
            hasIntegrity: Option.isSome(ref.integrity),
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
          }),
        );

        if (useExisting && Option.isSome(lockedEntry)) {
          const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
          if (observedTree === lockedEntry.value.treeIntegrity) {
            return lockedEntry.value.treeIntegrity;
          }
        }
        const materialized = yield* provide(
          materializeRegistryPackageWithTreeIntegrity({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "subagent",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            messages: {
              integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
            },
          }),
        );
        return materialized.treeIntegrity;
      });

    // Materialize canonical source for any ref type
    const materializeCanonical = (
      ref: SubagentExtensionRef,
      sanitized: string,
      canonicalPath: string,
      subagentSrcPath: string,
      force = false,
    ) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "git-hosted": {
            const packageRoot = stripFileProtocol(ref.location);
            const sourcePath =
              ws.layout.scope === "project" ? packageRoot : path.join(packageRoot, "src");
            const targetPath = ws.layout.scope === "project" ? canonicalPath : subagentSrcPath;
            const isSelfCopy = path.resolve(sourcePath) === path.resolve(targetPath);
            if (!isSelfCopy) {
              const materialized = yield* copyToCanonical(sourcePath, targetPath);
              return materialized.treeIntegrity;
            }
            return yield* provide(computeMaterializedTreeIntegrity(targetPath));
          }
          case "local": {
            const packageRoot = stripFileProtocol(ref.location);
            const sourcePath =
              ws.layout.scope === "project" ? packageRoot : path.join(packageRoot, "src");
            const targetPath = ws.layout.scope === "project" ? canonicalPath : subagentSrcPath;
            const isSelfCopy = path.resolve(sourcePath) === path.resolve(targetPath);
            if (!isSelfCopy) {
              const materialized = yield* copyToCanonical(sourcePath, targetPath);
              return materialized.treeIntegrity;
            }
            return yield* provide(computeMaterializedTreeIntegrity(targetPath));
          }
          case "registry": {
            return yield* materializeFromRegistry(ref, canonicalPath, force);
          }
          case "workspace": {
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(canonicalPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace subagent source location: ${ref.location}`,
              });
            }
            const exists = yield* fs.exists(subagentSrcPath).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to inspect workspace subagent source: ${subagentSrcPath}`,
                  cause: error,
                }),
              ),
            );
            if (!exists) {
              return yield* makeAppError({
                code: "validation",
                detail: `Workspace subagent source is missing: ${subagentSrcPath}`,
              });
            }
            return yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
          }
        }
      });

    const materializeInstall: ExtensionManager<SubagentExtensionRef>["materializeInstall"] =
      Effect.fn("SubagentManager.materializeInstall")(function* ({ ref, force }) {
        const { sanitized, paths } = getCanonicalPaths(ref);
        const { canonicalPath, subagentSrcPath } = paths;

        // --- Materialize canonical source ---
        const treeIntegrity = yield* materializeCanonical(
          ref,
          sanitized,
          canonicalPath,
          subagentSrcPath,
          force === true,
        );
        const manifestRaw = yield* fs
          .readFileString(path.join(canonicalPath, MANIFEST_FILENAME))
          .pipe(Effect.option);
        const manifestFallback = Option.isNone(manifestRaw)
          ? undefined
          : yield* Effect.try({
              try: () => decodeSubagentManifest(JSON.parse(manifestRaw.value)).fallback,
              catch: (cause) =>
                makeAppError({
                  code: "validation",
                  detail: `Failed to parse ${MANIFEST_FILENAME}`,
                  cause,
                }),
            });

        // --- Read content file ---
        const contentPath = subagentContentPath(path.join, subagentSrcPath, ref.subagent.name);
        const sourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
        if (Option.isNone(sourcePath)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent source path escapes workspace root: ${contentPath}`,
          });
        }
        const managedFile = managedSubagentFile(ref, sourcePath.value);
        const { parsed } = yield* readSubagentContent(subagentSrcPath, ref.subagent.name);

        // --- Resolve configured agents ---
        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));

        // --- Extract frontmatter fields ---
        const frontmatter: Readonly<Record<string, unknown>> = Option.getOrElse(
          parsed.frontmatter,
          () => ({}),
        );
        const agentOverrides = Option.getOrUndefined(parsed.agentOverrides);
        const renderFrontmatter = stripAgentOverrides(frontmatter);

        // --- Warn on overrides for agents not configured for this workspace ---
        yield* warnOnOrphanOverrides(
          `Subagent "${ref.subagent.name}"`,
          agentOverrides,
          configuredAgents.map((a) => a.id),
        );

        // --- Render to all agents concurrently ---
        const renderResults = yield* applyProjectionPlansWithResults(
          configuredAgents.map((agent) =>
            planSingletonProjection({
              unitId: "subagent:native-profile",
              // Some adapters co-locate multiple agent profiles. A shared key
              // deliberately serializes until the adapter exposes its exact file.
              targetFile: `subagent:${ref.subagent.name}:configured-agents`,
              contributor: ref,
              adapter: {
                observe: () =>
                  Effect.succeed({
                    unitId: "subagent:native-profile",
                    path: `${agent.id}:${ref.subagent.name}`,
                    present: false,
                    current: false,
                    expectedContributors: [ref.subagent.name],
                    observedContributors: [],
                  }),
                apply: () =>
                  agent
                    .addSubagent({
                      workspaceRoot: baseDir,
                      scope: ws.scope,
                      managedFile,
                      input: {
                        agentId: agent.id,
                        name: ref.subagent.name,
                        body: parsed.body,
                        frontmatter: renderFrontmatter,
                        agentOverrides: agentOverrides?.[agent.id],
                      },
                      force: false,
                    })
                    .pipe(
                      Effect.provide(fsPathLayer),
                      Effect.flatMap((outcome) => {
                        if (outcome._tag !== "unsupported") {
                          return Effect.succeed<SubagentSyncOutcome>(outcome);
                        }
                        if ((ref.fallback ?? manifestFallback) === "none") {
                          return makeAppError({
                            code: "validation",
                            detail: `Subagent ${ref.subagent.name} requires native subagent support for ${agent.id} because fallback is none`,
                          });
                        }
                        return agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
                          Effect.provide(fsPathLayer),
                          Effect.flatMap((skillsOutcome) => {
                            if (skillsOutcome._tag !== "supported") {
                              return Effect.succeed<SubagentSyncOutcome>(outcome);
                            }
                            const description = Option.getOrElse(
                              ref.subagent.description,
                              () => `Adopt the ${ref.subagent.name} role`,
                            );
                            return materializeRoleSkillFallback({
                              agentId: agent.id,
                              name: ref.subagent.name,
                              sanitized,
                              body: parsed.body,
                              description,
                              targetDir: skillsOutcome.dir,
                              managedFile,
                            }).pipe(
                              Effect.mapError((cause) =>
                                makeAppError({
                                  code: "internal",
                                  detail: `Failed to materialize subagent fallback for ${agent.id}`,
                                  cause,
                                }),
                              ),
                            );
                          }),
                        );
                      }),
                      Effect.map((outcome) => ({ agentId: agent.id, outcome })),
                    ),
              },
            }),
          ),
        );
        yield* Effect.forEach(renderResults, ({ agentId, outcome }) => {
          if (outcome._tag !== "success") return Effect.void;
          return Effect.logDebug(`Rendered ${ref.subagent.name} for ${agentId}`);
        });
        const successfulResults = renderResults.filter(({ outcome }) => outcome._tag === "success");
        const agentIdsByPath = new Map<string, Array<string>>();
        for (const { agentId, outcome } of successfulResults) {
          if (outcome._tag !== "success") continue;
          for (const renderedFilePath of outcome.renderedFilePaths) {
            const relativePath = path.isAbsolute(renderedFilePath)
              ? path.relative(baseDir, renderedFilePath)
              : path.normalize(renderedFilePath);
            const agentIds = agentIdsByPath.get(relativePath) ?? [];
            if (!agentIds.includes(agentId)) agentIds.push(agentId);
            agentIdsByPath.set(relativePath, agentIds);
          }
        }
        lastInstallState.set(ref.subagent.name, {
          sourceHash: yield* Effect.provide(computePackageContentHash(canonicalPath), fsPathLayer),
          treeIntegrity,
          materialization: {
            agents: successfulResults.map(({ agentId }) => agentId),
            targets: Array.from(agentIdsByPath.entries())
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([targetPath, agentIds]) => ({
                path: targetPath,
                agentIds,
              })),
          },
        });
      });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<SubagentExtensionRef>["materializeUninstall"] =>
      Effect.fn("SubagentManager.materializeRemoval")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));
        const removals = yield* applyProjectionPlansWithResults(
          configuredAgents.map((agent) =>
            planSingletonProjection({
              unitId: "subagent:native-profile",
              targetFile: `subagent:${target.name}:configured-agents`,
              contributor: target,
              adapter: {
                observe: () =>
                  Effect.succeed({
                    unitId: "subagent:native-profile",
                    path: `${agent.id}:${target.name}`,
                    present: true,
                    current: false,
                    expectedContributors: [],
                    observedContributors: [target.name],
                  }),
                apply: () =>
                  Effect.gen(function* () {
                    const removedPaths: Array<string> = [];
                    const resolved = yield* agent.resolveEffectiveSubagentsDir({
                      workspaceRoot: baseDir,
                      scope: ws.scope,
                    });
                    if (resolved._tag === "supported") {
                      const renderedFilePaths = yield* findManagedSubagentFiles(
                        resolved.dir,
                        sanitized,
                      ).pipe(Effect.provide(fsPathLayer));
                      yield* agent.removeSubagent({
                        workspaceRoot: baseDir,
                        scope: ws.scope,
                        subagentName: target.name,
                        renderedFilePaths: renderedFilePaths.map((filePath) =>
                          decodeRenderedFilePath(path.relative(baseDir, filePath)),
                        ),
                      });
                      removedPaths.push(...renderedFilePaths);
                    }

                    const skills = yield* agent.resolveEffectiveSkillsDir({
                      workspaceRoot: baseDir,
                    });
                    if (skills._tag === "supported") {
                      const fallbackPath = path.join(path.normalize(skills.dir), sanitized);
                      const fallbackContent = yield* fs
                        .readFileString(path.join(fallbackPath, "SKILL.md"))
                        .pipe(Effect.option);
                      if (
                        Option.isSome(fallbackContent) &&
                        hasAxmManagedMarker(fallbackContent.value)
                      ) {
                        yield* protectWorkspacePath(fallbackPath);
                        yield* fs.remove(fallbackPath, { recursive: true, force: true }).pipe(
                          Effect.mapError((error) =>
                            makeAppError({
                              code: "internal",
                              detail: `Failed to remove subagent fallback artifact: ${fallbackPath}`,
                              cause: error,
                            }),
                          ),
                        );
                        removedPaths.push(fallbackPath);
                      }
                    }

                    return { agentId: agent.id, removedPaths };
                  }).pipe(Effect.provide(fsPathLayer)),
              },
            }),
          ),
        );
        const agentIdsByPath = new Map<string, Array<string>>();
        for (const removal of removals) {
          for (const removedPath of removal.removedPaths) {
            const relativePath = path.relative(baseDir, removedPath);
            const agentIds = agentIdsByPath.get(relativePath) ?? [];
            if (!agentIds.includes(removal.agentId)) agentIds.push(removal.agentId);
            agentIdsByPath.set(relativePath, agentIds);
          }
        }
        lastUninstallState.set(target.name, {
          agents: removals
            .filter((removal) => removal.removedPaths.length > 0)
            .map((removal) => removal.agentId)
            .sort(),
          targets: Array.from(agentIdsByPath.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([targetPath, agentIds]) => ({
              path: targetPath,
              agentIds: [...agentIds].sort(),
            })),
        });

        // --- Remove canonical source directory ---
        if (!retainCanonical) {
          const canonical = yield* provide(
            acceptedCanonicalObservation({ workspace: ws, type: "subagent", name: target.name }),
          );
          const packageRoot = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(packageRoot)) yield* removeIfExists(fs, packageRoot.value);
        }
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    const projectionObservation = Effect.fn("SubagentManager.projectionObservation")(function* (
      ref: SubagentExtensionRef,
    ) {
      const { sanitized, paths } = getCanonicalPaths(ref);
      const manifestRaw = yield* fs
        .readFileString(path.join(paths.canonicalPath, MANIFEST_FILENAME))
        .pipe(Effect.option);
      const manifestFallback = Option.isNone(manifestRaw)
        ? undefined
        : yield* Effect.try({
            try: () => decodeSubagentManifest(JSON.parse(manifestRaw.value)).fallback,
            catch: (cause) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${MANIFEST_FILENAME}`,
                cause,
              }),
          });
      const contentPath = subagentContentPath(path.join, paths.subagentSrcPath, ref.subagent.name);
      const sourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
      if (Option.isNone(sourcePath)) return { present: false, current: false };
      const managedFile = managedSubagentFile(ref, sourcePath.value);
      const { parsed } = yield* readSubagentContent(paths.subagentSrcPath, ref.subagent.name);
      const frontmatter: Readonly<Record<string, unknown>> = Option.getOrElse(
        parsed.frontmatter,
        () => ({}),
      );
      const agentOverrides = Option.getOrUndefined(parsed.agentOverrides);
      const renderFrontmatter = stripAgentOverrides(frontmatter);
      const configuredAgents = yield* agentRepo
        .getConfiguredAgents()
        .pipe(Effect.provideService(WorkspaceMutations, ws));

      const current = yield* Effect.forEach(configuredAgents, (agent) =>
        agent.resolveEffectiveSubagentsDir({ workspaceRoot: baseDir, scope: ws.scope }).pipe(
          Effect.provide(fsPathLayer),
          Effect.flatMap((resolved) => {
            if (resolved._tag === "disabled") {
              return Effect.succeed({ present: true, current: true });
            }
            if (resolved._tag === "misconfigured") {
              return Effect.succeed({ present: false, current: false });
            }
            if (resolved._tag === "supported") {
              const rendered = renderManagedSubagentOutputs({
                workspaceRoot: baseDir,
                scope: ws.scope,
                force: false,
                managedFile,
                input: {
                  agentId: agent.id,
                  name: ref.subagent.name,
                  body: parsed.body,
                  frontmatter: renderFrontmatter,
                  agentOverrides: agentOverrides?.[agent.id],
                },
              });
              if (rendered === undefined) {
                const expected = buildRooModeEntry({
                  agentId: agent.id,
                  name: ref.subagent.name,
                  body: parsed.body,
                  frontmatter: renderFrontmatter,
                  agentOverrides: agentOverrides?.[agent.id],
                }).entry;
                return fs.readFileString(resolved.dir).pipe(
                  Effect.option,
                  Effect.map((content) => {
                    const observed = Option.isNone(content)
                      ? undefined
                      : parseRooModes(content.value).find(
                          (mode) => mode["slug"] === ref.subagent.name,
                        );
                    return {
                      present: observed !== undefined,
                      current: observed !== undefined && jsonValuesEqual(observed, expected),
                    };
                  }),
                );
              }
              if (rendered._tag === "Skipped") {
                return Effect.succeed({ present: true, current: true });
              }
              return Effect.forEach(rendered.outputs, (output) =>
                fs.readFileString(path.resolve(baseDir, output.path)).pipe(Effect.option),
              ).pipe(
                Effect.map((contents) => ({
                  present: contents.every(Option.isSome),
                  current: contents.every(
                    (content, index) =>
                      Option.isSome(content) && content.value === rendered.outputs[index]?.content,
                  ),
                })),
              );
            }
            if ((ref.fallback ?? manifestFallback) === "none") {
              return Effect.succeed({ present: false, current: false });
            }
            return agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
              Effect.provide(fsPathLayer),
              Effect.flatMap((skills) => {
                if (skills._tag === "disabled" || skills._tag === "unsupported") {
                  return Effect.succeed({ present: true, current: true });
                }
                if (skills._tag === "misconfigured") {
                  return Effect.succeed({ present: false, current: false });
                }
                const description = Option.getOrElse(
                  ref.subagent.description,
                  () => `Adopt the ${ref.subagent.name} role`,
                );
                const expected = roleSkillContent({
                  agentId: agent.id,
                  name: ref.subagent.name,
                  body: parsed.body,
                  description,
                  managedFile,
                });
                return fs
                  .readFileString(path.join(path.normalize(skills.dir), sanitized, "SKILL.md"))
                  .pipe(
                    Effect.option,
                    Effect.map((content) => ({
                      present: Option.isSome(content),
                      current: Option.exists(content, (value) => value === expected),
                    })),
                  );
              }),
            );
          }),
        ),
      );
      return {
        present: current.every(({ present }) => present),
        current: current.every((observation) => observation.current),
      };
    });

    return {
      type: "subagent",
      projectionObservation,
      runTransaction: ws.runTransaction,
      isInstalled: Effect.fn("SubagentManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "subagent", target.name);
      }),

      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "subagent",
            name: ref.subagent.name,
            ref,
          }),
        ),
      getLastMaterialization: ({ target }) =>
        Effect.succeed(
          lastInstallState.get(target.name)?.materialization ?? { agents: [], targets: [] },
        ),
      getConfiguredSource: Effect.fn("SubagentManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredSubagentEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("SubagentManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("subagent")
          .pipe(Effect.map(configuredRowsByName));
        return yield* configuredSubagentsToDiskRefs(
          { fs, path, baseDir, scope: ws.scope, layout: ws.layout },
          configured,
        );
      }),
      materializeUninstall,
      materializeDeactivate,
      getLastUnmaterialization: ({ target }) =>
        Effect.succeed(lastUninstallState.get(target.name) ?? { agents: [], targets: [] }),

      upsertSettingsEntry: Effect.fn("SubagentManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }: {
        readonly ref: SubagentExtensionRef;
        readonly versionRange: Option.Option<string>;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(
                path,
                baseDir,
                ref.sourcePath ?? stripFileProtocol(ref.location),
              )
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const state = lastInstallState.get(ref.subagent.name);
        if (ref.refType === "workspace") {
          return yield* ws.setSubagentEntry(ref.subagent.name, {
            source: "workspace",
            enabled: true,
          });
        }
        if (state === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent ${ref.subagent.name} has no materialized content identity`,
          });
        }
        const lockEntry = buildSubagentLockEntry(
          ref,
          state.sourceHash,
          state.treeIntegrity,
          workspaceRelativeLocalSourcePath,
        );
        if (lockEntry === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent ${ref.subagent.name} did not produce an external resolution`,
          });
        }
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagent({
          name: ref.subagent.name,
          lockEntry,
          versionRange,
        });
      }),

      removeSettingsEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentSettings(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("SubagentManager.upsertLockfileEntry")(function* ({
        ref,
      }: {
        readonly ref: SubagentExtensionRef;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(
                path,
                baseDir,
                ref.sourcePath ?? stripFileProtocol(ref.location),
              )
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        if (ref.refType === "workspace") {
          yield* ws.removeSubagentLock(ref.subagent.name);
          return;
        }
        const state = lastInstallState.get(ref.subagent.name);
        if (state === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent ${ref.subagent.name} has no materialized content identity`,
          });
        }
        const lockEntry = buildSubagentLockEntry(
          ref,
          state.sourceHash,
          state.treeIntegrity,
          workspaceRelativeLocalSourcePath,
        );
        if (lockEntry === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent ${ref.subagent.name} did not produce an external resolution`,
          });
        }
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagentLock({
          name: ref.subagent.name,
          lockEntry,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentLock(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeLockfileEntry")),
    } satisfies SubagentManagerService;
  }),
);
