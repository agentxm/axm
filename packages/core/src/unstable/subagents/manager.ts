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
import * as Path from "effect/Path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { trustedRegistryVersionForRef, validateRefTrustTransition } from "../trust/index.js";
import * as ServiceMap from "effect/Context";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import type { SubagentExtensionRef, RegistrySubagentRef } from "./refs.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  MaterializationObservation,
  SubagentExtensionTarget,
} from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { CodingAgentRepository, type SubagentSyncOutcome } from "../agents/index.js";
import { sanitizeName, copyExtensionDirectory } from "../extensions/utils.js";
import {
  removeFromAllCanonicalLocations,
  stripFileProtocol,
  makeWorkspaceRelativeSourcePath,
  computeIntegrity,
} from "../utils/index.js";
import { computeSubagentPaths, subagentContentFilename, subagentContentPath } from "./paths.js";
import type { SubagentPathSource } from "./paths.js";
import { parseSubagentMd } from "./subagent-content.js";
import { warnOnOrphanOverrides } from "./rendering/overrides.js";
import { configuredSubagentsToDiskRefs } from "../extensions/materializable-from-disk.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { buildSubagentLockEntry } from "./lock-entry-builder.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import {
  computePackageContentHash,
  computeSourceHash,
  insertManagedFileBanner,
  RenderedFilePathSchema,
  shouldReuseCanonicalInstall,
  type SourceHash,
} from "../extensions/index.js";
import { MANIFEST_FILENAME, SubagentManifestSchema } from "./manifest-schema.js";
import {
  findManagedSubagentFiles,
  hasAxmManagedMarker,
} from "../workspace/rendered-file-cleanup.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { protectWorkspacePath } from "../workspace/transaction.js";

const decodeSubagentManifest = Schema.decodeUnknownSync(SubagentManifestSchema);
const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

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

export class SubagentManager extends ServiceMap.Service<
  SubagentManager,
  ExtensionManager<SubagentExtensionRef>
>()("@agentxm/client-core/unstable/subagents/manager/SubagentManager") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);
    const materializeRoleSkillFallback = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly sanitized: string;
      readonly body: string;
      readonly description: string;
      readonly targetDir: string;
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
        const skillContent = insertManagedFileBanner(
          `---\nname: ${args.name}\ndescription: ${args.description}\n---\n\n# ${args.name} role\n\nAdopt this role for the current task. This is an advisory role-skill fallback because ${args.agentId} has no native subagent surface.\n\n${args.body.trim()}\n`,
          {
            editPath: `subagents/${args.name}.md`,
            helpTopic: "subagents",
            format: "markdown",
          },
        );
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
      }
    >();
    const lastUninstallState = new Map<string, MaterializationObservation>();

    // Compute canonical paths for a subagent ref
    const getCanonicalPaths = (ref: SubagentExtensionRef) => {
      const sanitized = sanitizeName(ref.subagent.name);
      const source: SubagentPathSource =
        ref.refType === "registry" || ref.refType === "workspace"
          ? { refType: ref.refType, owner: ref.owner }
          : { refType: ref.refType };
      const paths = computeSubagentPaths(path.join, baseDir, source, sanitized);
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
        const parsed = yield* parseSubagentMd(rawContent, name);
        return { rawContent, parsed };
      });

    // Copy source to canonical location
    const copyToCanonical = (sourcePath: string, targetPath: string) =>
      Effect.gen(function* () {
        yield* protectWorkspacePath(targetPath);
        yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to create directory for subagent: ${targetPath}`,
              cause: error,
            }),
          ),
        );
        yield* provide(
          copyExtensionDirectory(sourcePath, targetPath).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "internal",
                detail: `Failed to copy subagent files to ${targetPath}`,
                cause: e,
              }),
            ),
          ),
        );
      });

    // Materialize from registry
    const materializeFromRegistry = (
      ref: RegistrySubagentRef,
      canonicalPath: string,
      force: boolean,
    ) =>
      Effect.gen(function* () {
        const canonicalExists = yield* fs.exists(canonicalPath).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "internal",
              detail: `Failed to check if canonical path exists: ${canonicalPath}`,
              cause: e,
            }),
          ),
        );
        const lockedVersion = trustedRegistryVersionForRef(yield* ws.getTrustState(), ref);
        const useExisting = shouldReuseCanonicalInstall({
          canonicalExists,
          force,
          hasIntegrity: Option.isSome(ref.integrity),
          refVersion: ref.version,
          lockedVersion,
        });

        if (!useExisting) {
          const locationStr =
            ref.source.location.protocol === "file:"
              ? ref.source.location.pathname
              : ref.source.location.href;
          const client = yield* provide(createRegistryClient(locationStr));
          const { archive } = yield* client.getExtensionPackage({
            owner: ref.owner,
            type: "subagent",
            name: ref.name,
            version: Option.some(ref.version),
          });

          if (Option.isSome(ref.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== ref.integrity.value) {
              return yield* makeAppError({
                code: "internal",
                detail: `Integrity mismatch for ${ref.name}@${ref.version}`,
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Temporary directory for registry install could not be created`,
                cause: e,
              }),
            ),
          );
          const cleanup = fs.remove(tmpDir, { recursive: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove temporary subagent directory ${tmpDir}`,
                cause: error,
              }),
            ),
          );
          yield* Effect.gen(function* () {
            yield* provide(extractZip(archive, tmpDir));
            yield* protectWorkspacePath(canonicalPath);
            yield* fs.remove(canonicalPath, { recursive: true, force: true }).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to replace canonical subagent source: ${canonicalPath}`,
                  cause: error,
                }),
              ),
            );
            yield* provide(
              copyExtensionDirectory(tmpDir, canonicalPath).pipe(
                Effect.mapError((e) =>
                  makeAppError({
                    code: "internal",
                    detail: `Failed to copy subagent files to ${canonicalPath}`,
                    cause: e,
                  }),
                ),
              ),
            );
          }).pipe(
            Effect.tapError(() => cleanup),
            Effect.tap(() => cleanup),
          );
        }
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
            const sourcePath = stripFileProtocol(ref.location);
            const isSelfCopy = path.resolve(sourcePath) === path.resolve(subagentSrcPath);
            if (!isSelfCopy) {
              yield* removeFromAllCanonicalLocations(fs, baseDir, "subagents", sanitized, path);
              yield* copyToCanonical(sourcePath, subagentSrcPath);
            }
            break;
          }
          case "local": {
            const sourcePath = stripFileProtocol(ref.location);
            const isSelfCopy = path.resolve(sourcePath) === path.resolve(subagentSrcPath);
            if (!isSelfCopy) {
              yield* removeFromAllCanonicalLocations(fs, baseDir, "subagents", sanitized, path);
              yield* copyToCanonical(sourcePath, subagentSrcPath);
            }
            break;
          }
          case "registry": {
            yield* materializeFromRegistry(ref, canonicalPath, force);
            break;
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
            break;
          }
        }
      });

    const materializeInstall: ExtensionManager<SubagentExtensionRef>["materializeInstall"] =
      Effect.fn("SubagentManager.materializeInstall")(function* ({ ref, force }) {
        const { sanitized, paths } = getCanonicalPaths(ref);
        const { canonicalPath, subagentSrcPath } = paths;

        // --- Materialize canonical source ---
        yield* materializeCanonical(ref, sanitized, canonicalPath, subagentSrcPath, force === true);
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
        const editSourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
        if (Option.isNone(editSourcePath)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Subagent source path escapes workspace root: ${contentPath}`,
          });
        }
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
        const renderResults = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent
              .addSubagent({
                workspaceRoot: baseDir,
                scope: "project",
                editSourcePath: editSourcePath.value,
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
          { concurrency: "unbounded" },
        );
        yield* Effect.forEach(renderResults, ({ agentId, outcome }) => {
          if (outcome._tag !== "success") return Effect.void;
          return Effect.logDebug(`Rendered ${ref.subagent.name} for ${agentId}`);
        });
        lastInstallState.set(ref.subagent.name, {
          sourceHash: yield* Effect.provide(computePackageContentHash(canonicalPath), fsPathLayer),
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
        const removals = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
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
                  scope: "project",
                  subagentName: target.name,
                  renderedFilePaths: renderedFilePaths.map((filePath) =>
                    decodeRenderedFilePath(path.relative(baseDir, filePath)),
                  ),
                });
                removedPaths.push(...renderedFilePaths);
              }

              const skills = yield* agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir });
              if (skills._tag === "supported") {
                const fallbackPath = path.join(path.normalize(skills.dir), sanitized);
                const fallbackContent = yield* fs
                  .readFileString(path.join(fallbackPath, "SKILL.md"))
                  .pipe(Effect.option);
                if (Option.isSome(fallbackContent) && hasAxmManagedMarker(fallbackContent.value)) {
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
          { concurrency: "unbounded" },
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
          yield* removeFromAllCanonicalLocations(fs, baseDir, "subagents", sanitized, path);
        }
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "subagent",
      runTransaction: ws.runTransaction,
      validateTrustTransition: (args) =>
        ws
          .getTrustState()
          .pipe(Effect.flatMap((state) => validateRefTrustTransition(state, args.ref, args))),
      isInstalled: Effect.fn("SubagentManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "subagent", target.name);
      }),

      materializeInstall,
      getConfiguredSource: Effect.fn("SubagentManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredSubagentEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("SubagentManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("subagent")
          .pipe(Effect.map(configuredRowsByName));
        return yield* configuredSubagentsToDiskRefs(
          { fs, path, baseDir, scope: ws.scope },
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
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const now = yield* DateTime.now;
        const lockEntry = buildSubagentLockEntry(ref, now, workspaceRelativeLocalSourcePath);
        const state = lastInstallState.get(ref.subagent.name);
        const sharedLockEntry =
          state === undefined
            ? lockEntry
            : {
                ...lockEntry,
                sourceHash: state.sourceHash,
              };
        if (sharedLockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            sharedLockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagent({
          name: ref.subagent.name,
          lockEntry: sharedLockEntry,
          versionRange,
          commit: "authoritative",
        });
      }),

      upsertTrustEntry: Effect.fn("SubagentManager.upsertTrustEntry")(function* ({ ref }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const now = yield* DateTime.now;
        const lockEntry = buildSubagentLockEntry(ref, now, workspaceRelativeLocalSourcePath);
        const state = lastInstallState.get(ref.subagent.name);
        const sharedLockEntry =
          state === undefined ? lockEntry : { ...lockEntry, sourceHash: state.sourceHash };
        return yield* ws.setSubagentLock({
          name: ref.subagent.name,
          lockEntry: sharedLockEntry,
          versionRange: Option.none(),
          commit: "authoritative",
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
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const now = yield* DateTime.now;
        const lockEntry = buildSubagentLockEntry(ref, now, workspaceRelativeLocalSourcePath);
        const state = lastInstallState.get(ref.subagent.name);
        const sharedLockEntry =
          state === undefined
            ? lockEntry
            : {
                ...lockEntry,
                sourceHash: state.sourceHash,
              };
        if (sharedLockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            sharedLockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagentLock({
          name: ref.subagent.name,
          lockEntry: sharedLockEntry,
          versionRange: Option.none(),
          commit: "receipt",
        });
      }),

      removeLockfileEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentLock(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeLockfileEntry")),
      removeTrustEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws.removeTrustRecord("subagent", target.name),
    } satisfies ExtensionManager<SubagentExtensionRef>;
  }),
);
