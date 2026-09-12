import { usableAcceptedCanonical } from "@agentxm/workspace-state";
import { LifecyclePostconditionViolated } from "../extensions/errors.js";
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
import { stripFileProtocol } from "@agentxm/registry-client";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type {
  SubagentExtensionRef,
  RegistrySubagentRef,
} from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { ExtensionManager, ManagerRequirements } from "../manager-contract.js";
import type { SubagentMaterializationFacts } from "../managers.js";
import type { ExtensionManagerFailure } from "../errors.js";
import type { SubagentPathSource } from "@agentxm/workspace-state";
import type { ExtensionTarget } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
} from "@agentxm/workspace-state";
import {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
} from "./errors.js";
import { buildSubagentLockEntry } from "./lock-entry-builder.js";
import {
  CodingAgentRepository,
  managedSubagentRenderInput,
  renderManagedSubagentOutputs,
  managedFileFormatForPath,
  managedFileMarker,
  projectionGeneration,
  findManagedSubagentFiles,
  hasAxmManagedMarker,
  applyProjectionPlansWithResults,
  planSingletonProjection,
  managedSubagentFile,
} from "@agentxm/workspace-projection";
import {
  type SubagentSyncOutcome,
  SubagentIoFailed,
  warnOnOrphanOverrides,
  buildRooModeEntry,
} from "@agentxm/agent-integration";
import { copyExtensionDirectory } from "../extensions/copy-directory.js";
import { sanitizeName } from "@agentxm/workspace-state";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";
import { parseSubagentMd } from "@agentxm/extension-content";
import { configuredSubagentsToDiskRefs } from "../extensions/materializable-from-disk.js";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "@agentxm/workspace-state";
import {
  canReuseInstalledPackage,
  materializeExternalPackageWithTreeIntegrity,
} from "../extensions/canonical-directory.js";
import { materializeRegistryPackageWithTreeIntegrity } from "../registry-materialization.js";
import { insertManagedFileBanner, type ManagedFileProvenance } from "@agentxm/workspace-projection";
import { SubagentManager, type SubagentManagerService } from "../managers.js";
import { computePackageContentHash } from "@agentxm/workspace-state";
import { computeSourceHash, RenderedFilePathSchema } from "@agentxm/workspace-state";
import { type SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { configuredRowsByName } from "@agentxm/workspace-state";
import { isObservedInstalled } from "@agentxm/workspace-state";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-transactions";

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
// Live Layer
// -----------------------------------------------------------------------------

/**
 * The content identity a subagent acquisition established, in the shape the
 * settings and lockfile writers consume.
 */
const acquiredState = (
  materialization: Option.Option<SubagentMaterializationFacts>,
): { readonly sourceHash: SourceHash; readonly treeIntegrity: TreeIntegrity } | undefined => {
  if (Option.isNone(materialization)) return undefined;
  const { sourceHash, treeIntegrity } = materialization.value;
  if (Option.isNone(sourceHash) || Option.isNone(treeIntegrity)) return undefined;
  return { sourceHash: sourceHash.value, treeIntegrity: treeIntegrity.value };
};

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;
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
          generation: projectionGeneration([
            "subagent-role-skill-v1",
            args.managedFile.ext,
            args.managedFile.source.kind,
            args.managedFile.source.path,
            args.agentId,
            args.name,
            args.description,
            args.body,
          ]),
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
    const serializedJsonValuesEqual = (left: string, right: string): boolean => {
      try {
        const leftValue: unknown = JSON.parse(left);
        const rightValue: unknown = JSON.parse(right);
        return jsonValuesEqual(leftValue, rightValue);
      } catch {
        return false;
      }
    };
    const generatedFileCurrent = (args: {
      readonly content: string;
      readonly expected: string;
      readonly outputPath: string;
    }): boolean => {
      const format = managedFileFormatForPath(args.outputPath);
      if (format === undefined) {
        return args.outputPath.endsWith(".json")
          ? serializedJsonValuesEqual(args.content, args.expected)
          : args.content === args.expected;
      }
      const actualMarker = managedFileMarker(args.content, format);
      const expectedMarker = managedFileMarker(args.expected, format);
      return (
        Option.isSome(actualMarker) &&
        Option.isSome(expectedMarker) &&
        actualMarker.value.ext === expectedMarker.value.ext &&
        actualMarker.value.src === expectedMarker.value.src &&
        actualMarker.value.generation === expectedMarker.value.generation
      );
    };

    const materializeRoleSkillFallback = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly sanitized: string;
      readonly body: string;
      readonly description: string;
      readonly targetDir: string;
      readonly managedFile: ManagedFileProvenance;
    }): Effect.Effect<SubagentSyncOutcome, ExtensionManagerFailure, ManagerRequirements> =>
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
        yield* copyExtensionDirectory(polyfillDir, targetPath, {
          forAgentArtifact: true,
        });
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
          cause._tag === "WorkspaceSnapshotError"
            ? cause
            : new SubagentIoFailed({
                detail: `Failed to materialize subagent fallback for ${args.agentId}`,
                cause,
              }),
        ),
      );

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
          Effect.mapError(
            (cause) =>
              new SubagentContentUnreadable({
                expectedFilename,
                subagentSrcPath,
                contentPath,
                cause,
              }),
          ),
        );
        const parsed = yield* parseSubagentMd(rawContent, name);
        return { rawContent, parsed };
      });

    // Copy source to canonical location
    const copyToCanonical = (sourcePath: string, targetPath: string) =>
      materializeExternalPackageWithTreeIntegrity({
        baseDir,
        canonicalPath: targetPath,
        sourceLocation: sourcePath,
        copyFailureCode: "internal",
        copyFailureDetail: (target) => `Failed to copy subagent files to ${target}`,
      });

    // Materialize from registry
    const materializeFromRegistry = (
      ref: RegistrySubagentRef,
      canonicalPath: string,
      force: boolean,
    ) =>
      Effect.gen(function* () {
        const lockedEntry = yield* ws.getLockedSubagent(ref.subagent.name);
        const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
        const useExisting = yield* canReuseInstalledPackage({
          installedPath: canonicalPath,
          force,
          refVersion: ref.version,
          hasIntegrity: Option.isSome(ref.integrity),
          ...(lockedVersion === undefined ? {} : { lockedVersion }),
          existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
        });

        if (useExisting && Option.isSome(lockedEntry)) {
          const observedTree = yield* computeMaterializedTreeIntegrity(canonicalPath);
          if (observedTree === lockedEntry.value.treeIntegrity) {
            return lockedEntry.value.treeIntegrity;
          }
        }
        const materialized = yield* materializeRegistryPackageWithTreeIntegrity({
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
        });
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
            return yield* computeMaterializedTreeIntegrity(targetPath);
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
            return yield* computeMaterializedTreeIntegrity(targetPath);
          }
          case "registry": {
            return yield* materializeFromRegistry(ref, canonicalPath, force);
          }
          case "workspace": {
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(canonicalPath)
            ) {
              return yield* new SubagentDefinitionInvalid({
                detail: `Invalid workspace subagent source location: ${ref.location}`,
              });
            }
            const exists = yield* fs.exists(subagentSrcPath).pipe(
              Effect.mapError(
                (cause) =>
                  new SubagentIoFailed({
                    detail: `Failed to inspect workspace subagent source: ${subagentSrcPath}`,
                    cause,
                  }),
              ),
            );
            if (!exists) {
              return yield* new SubagentDefinitionInvalid({
                detail: `Workspace subagent source is missing: ${subagentSrcPath}`,
              });
            }
            return yield* computeMaterializedTreeIntegrity(canonicalPath);
          }
        }
      });

    const materializeInstall: ExtensionManager<
      SubagentExtensionRef,
      SubagentMaterializationFacts,
      ManagerRequirements
    >["materializeInstall"] = Effect.fn("SubagentManager.materializeInstall")(function* ({
      ref,
      force,
    }) {
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
              new SubagentDefinitionInvalid({
                detail: `Failed to parse ${MANIFEST_FILENAME}`,
                cause,
              }),
          });

      // --- Read content file ---
      const contentPath = subagentContentPath(path.join, subagentSrcPath, ref.subagent.name);
      const sourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
      if (Option.isNone(sourcePath)) {
        return yield* new SubagentIoFailed({
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
                    input: managedSubagentRenderInput({
                      managedFile,
                      input: {
                        agentId: agent.id,
                        name: ref.subagent.name,
                        body: parsed.body,
                        frontmatter: renderFrontmatter,
                        agentOverrides: agentOverrides?.[agent.id],
                      },
                    }),
                    force: false,
                  })
                  .pipe(
                    Effect.flatMap(
                      (
                        outcome,
                      ): Effect.Effect<
                        SubagentSyncOutcome,
                        ExtensionManagerFailure,
                        ManagerRequirements
                      > => {
                        if (outcome._tag !== "unsupported") {
                          return Effect.succeed<SubagentSyncOutcome>(outcome);
                        }
                        if ((ref.fallback ?? manifestFallback) === "none") {
                          return new SubagentDefinitionInvalid({
                            detail: `Subagent ${ref.subagent.name} requires native subagent support for ${agent.id} because fallback is none`,
                          });
                        }
                        return agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
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
                              Effect.mapError(
                                (cause) =>
                                  new SubagentIoFailed({
                                    detail: `Failed to materialize subagent fallback for ${agent.id}`,
                                    cause,
                                  }),
                              ),
                            );
                          }),
                        );
                      },
                    ),
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
      return {
        sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
        treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
        observation: {
          agents: successfulResults.map(({ agentId }) => agentId),
          targets: Array.from(agentIdsByPath.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([targetPath, agentIds]) => ({
              path: targetPath,
              agentIds,
            })),
        },
      } satisfies SubagentMaterializationFacts;
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<
      SubagentExtensionRef,
      SubagentMaterializationFacts,
      ManagerRequirements
    >["materializeUninstall"] =>
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
                      );
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
                          Effect.mapError(
                            (cause) =>
                              new SubagentIoFailed({
                                detail: `Failed to remove subagent fallback artifact: ${fallbackPath}`,
                                cause,
                              }),
                          ),
                        );
                        removedPaths.push(fallbackPath);
                      }
                    }

                    return { agentId: agent.id, removedPaths };
                  }),
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
        const withdrawn: SubagentMaterializationFacts = {
          sourceHash: Option.none(),
          treeIntegrity: Option.none(),
          observation: {
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
          },
        };

        // --- Remove canonical source directory ---
        if (!retainCanonical) {
          const canonical = yield* acceptedCanonicalObservation({
            workspace: ws,
            type: "subagent",
            name: target.name,
          });
          const packageRoot = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(packageRoot)) yield* removeIfExists(fs, packageRoot.value);
        }
        return withdrawn;
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
              new SubagentDefinitionInvalid({
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
          Effect.flatMap((resolved) => {
            if (resolved._tag === "disabled") {
              return Effect.succeed({ present: true, current: true });
            }
            if (resolved._tag === "misconfigured") {
              return Effect.succeed({ present: false, current: false });
            }
            if (resolved._tag === "supported") {
              const rendered = renderManagedSubagentOutputs({
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
                      Option.isSome(content) &&
                      rendered.outputs[index] !== undefined &&
                      generatedFileCurrent({
                        content: content.value,
                        expected: rendered.outputs[index].content,
                        outputPath: rendered.outputs[index].path,
                      }),
                  ),
                })),
              );
            }
            if ((ref.fallback ?? manifestFallback) === "none") {
              return Effect.succeed({ present: false, current: false });
            }
            return agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
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
                      current: Option.exists(content, (value) =>
                        generatedFileCurrent({
                          content: value,
                          expected,
                          outputPath: "SKILL.md",
                        }),
                      ),
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
      isInstalled: Effect.fn("SubagentManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "subagent", target.name);
      }),

      materializeInstall,
      acquireCanonical: ({ ref, force }) =>
        Effect.gen(function* () {
          const {
            sanitized,
            paths: { canonicalPath, subagentSrcPath },
          } = getCanonicalPaths(ref);
          const treeIntegrity = yield* materializeCanonical(
            ref,
            sanitized,
            canonicalPath,
            subagentSrcPath,
            force === true,
          );
          yield* readSubagentContent(subagentSrcPath, ref.subagent.name);
          return {
            sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
            treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
            observation: { agents: [], targets: [] },
          };
        }),
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            workspace: ws,
            type: "subagent",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "subagent") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "subagent",
              targetName: target.name,
            });
          }
          return yield* materializeInstall({ ref: canonical.value.ref });
        }),
      prepareSourceTransition: ({ ref }) =>
        prepareAcceptedCanonicalTransition({
          workspace: ws,
          type: "subagent",
          name: ref.subagent.name,
          ref,
        }),
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

      acceptedResolution: Effect.fn("SubagentManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }: {
        readonly ref: SubagentExtensionRef;
        readonly materialization: Option.Option<SubagentMaterializationFacts>;
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
          return yield* new SubagentDefinitionInvalid({
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        if (ref.refType === "workspace") {
          return Option.none();
        }
        const state = acquiredState(materialization);
        if (state === undefined) {
          return yield* new SubagentInstallStateMissing({
            name: ref.subagent.name,
            kind: "content-identity",
          });
        }
        const lockEntry = buildSubagentLockEntry(
          ref,
          state.sourceHash,
          state.treeIntegrity,
          workspaceRelativeLocalSourcePath,
        );
        if (lockEntry === undefined) {
          return yield* new SubagentInstallStateMissing({
            name: ref.subagent.name,
            kind: "external-resolution",
          });
        }
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return Option.some({ key: ref.subagent.name, entry: lockEntry });
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies SubagentManagerService;
  }),
);
