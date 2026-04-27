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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import { makeAppError } from "../app-error/index.js";
import type { SubagentExtensionRef, RegistrySubagentRef } from "./refs.js";
import type { ExtensionManager, SubagentExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { CodingAgentRepository } from "../agents/index.js";
import { sanitizeName, copyExtensionDirectory } from "../extensions/utils.js";
import {
  removeFromAllCanonicalLocations,
  stripFileProtocol,
  computeIntegrity,
} from "../utils/index.js";
import { computeSubagentPaths, SUBAGENT_CONTENT_FILENAME } from "./paths.js";
import type { SubagentPathSource } from "./paths.js";
import { parseSubagentMd } from "./subagent-content.js";
import { computeSourceHash, RenderedFilesMapSchema } from "../extensions/rendered-files.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { buildSubagentLockEntry } from "./lock-entry-builder.js";
import { createRegistryClient, extractZip } from "../registry/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class SubagentManager extends ServiceMap.Service<
  SubagentManager,
  ExtensionManager<SubagentExtensionRef>
>()("axm.sh/SubagentManager") {}

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
    const agents = yield* ws.getConfiguredAgents();
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    // Compute canonical paths for a subagent ref
    const getCanonicalPaths = (ref: SubagentExtensionRef) => {
      const sanitized = sanitizeName(ref.subagent.name);
      const source: SubagentPathSource =
        ref.refType === "registry"
          ? { refType: "registry", owner: ref.owner }
          : { refType: ref.refType };
      const paths = computeSubagentPaths(path.join, baseDir, source, sanitized);
      return { sanitized, paths };
    };

    // Read and parse SUBAGENT.md from canonical source
    const readSubagentContent = (subagentSrcPath: string) =>
      Effect.gen(function* () {
        const contentPath = path.join(subagentSrcPath, SUBAGENT_CONTENT_FILENAME);
        const rawContent = yield* fs.readFileString(contentPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "SUBAGENT_CONTENT_READ_FAILED",
              what: `Failed to read ${SUBAGENT_CONTENT_FILENAME} from ${subagentSrcPath}`,
              cause: error,
            }),
          ),
        );
        const parsed = yield* parseSubagentMd(rawContent);
        return { rawContent, parsed };
      });

    // Copy source to canonical location
    const copyToCanonical = (sourcePath: string, targetPath: string) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "INSTALL_SUBAGENT_DIR_FAILED",
              what: `Failed to create directory for subagent: ${targetPath}`,
              cause: error,
            }),
          ),
        );
        yield* provide(
          copyExtensionDirectory(sourcePath, targetPath).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "INSTALL_SUBAGENT_COPY_FAILED",
                what: `Failed to copy subagent files to ${targetPath}`,
                cause: e,
              }),
            ),
          ),
        );
      });

    // Materialize from registry
    const materializeFromRegistry = (ref: RegistrySubagentRef, canonicalPath: string) =>
      Effect.gen(function* () {
        const canonicalExists = yield* fs.exists(canonicalPath).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "INSTALL_SUBAGENT_PATH_CHECK_FAILED",
              what: `Failed to check if canonical path exists: ${canonicalPath}`,
              cause: e,
            }),
          ),
        );
        const useExisting = Option.isNone(ref.integrity) && canonicalExists;

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
                code: "INSTALL_SUBAGENT_INTEGRITY_MISMATCH",
                what: `Integrity mismatch for ${ref.name}@${ref.version}`,
                details: [`Expected ${ref.integrity.value}, got ${actualIntegrity}`],
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "INSTALL_SUBAGENT_TEMP_DIR_FAILED",
                what: `Failed to create temporary directory for registry install`,
                cause: e,
              }),
            ),
          );
          yield* Effect.ensuring(
            Effect.gen(function* () {
              yield* provide(extractZip(archive, tmpDir));
              yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
              yield* provide(
                copyExtensionDirectory(tmpDir, canonicalPath).pipe(
                  Effect.mapError((e) =>
                    makeAppError({
                      code: "INSTALL_SUBAGENT_COPY_FAILED",
                      what: `Failed to copy subagent files to ${canonicalPath}`,
                      cause: e,
                    }),
                  ),
                ),
              );
            }),
            fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
          );
        }
      });

    // Materialize canonical source for any ref type
    const materializeCanonical = (
      ref: SubagentExtensionRef,
      sanitized: string,
      canonicalPath: string,
      subagentSrcPath: string,
    ) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "git-hosted": {
            const sourcePath = stripFileProtocol(ref.location);
            yield* removeFromAllCanonicalLocations(fs, baseDir, "subagents", sanitized, path);
            yield* copyToCanonical(sourcePath, subagentSrcPath);
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
            yield* materializeFromRegistry(ref, canonicalPath);
            break;
          }
        }
      });

    const materializeInstall: ExtensionManager<SubagentExtensionRef>["materializeInstall"] =
      Effect.fn("SubagentManager.materializeInstall")(function* ({ ref }) {
        const { sanitized, paths } = getCanonicalPaths(ref);
        const { canonicalPath, subagentSrcPath } = paths;

        // --- Materialize canonical source ---
        yield* materializeCanonical(ref, sanitized, canonicalPath, subagentSrcPath);

        // --- Read SUBAGENT.md ---
        const { rawContent, parsed } = yield* readSubagentContent(subagentSrcPath);
        const currentHash = computeSourceHash(rawContent);

        // --- Source-hash-based skip logic (6.4) ---
        const existingLockEntry = yield* ws.getLockedSubagent(ref.subagent.name);
        if (Option.isSome(existingLockEntry)) {
          const existing = existingLockEntry.value;
          if (existing.sourceHash !== undefined && existing.sourceHash === currentHash) {
            // Source unchanged, skip re-rendering
            return;
          }
        }

        // --- Resolve configured agents ---
        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));

        // --- Extract frontmatter fields ---
        const frontmatter = Option.getOrUndefined(parsed.frontmatter);

        // --- Render to all agents concurrently ---
        const renderedFilesMap: Record<string, Array<{ path: string }>> = {};

        yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent
              .addSubagent({
                workspaceRoot: baseDir,
                scope: "project",
                input: {
                  agentId: agent.id,
                  name: ref.subagent.name,
                  description: frontmatter?.description ?? "",
                  model: frontmatter?.model,
                  toolAccess: frontmatter?.toolAccess,
                  background: frontmatter?.background,
                  body: parsed.body,
                  agentOverrides: frontmatter?.overrides,
                },
                force: false,
              })
              .pipe(
                Effect.provide(fsPathLayer),
                Effect.map((outcome) => {
                  if (outcome._tag === "success") {
                    renderedFilesMap[agent.id] = outcome.renderedFilePaths.map((p) => ({
                      path: p,
                    }));
                  }
                }),
              ),
          { concurrency: "unbounded" },
        );

        // --- Update lockfile with rendered files and source hash ---
        const lockEntry = buildSubagentLockEntry(ref, agents, new Date());
        const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);
        const lockEntryWithRendered = {
          ...lockEntry,
          sourceHash: currentHash,
          renderedFiles: decodeRenderedFiles(renderedFilesMap),
        };
        yield* ws.setSubagentLock({ name: ref.subagent.name, lockEntry: lockEntryWithRendered });
      });

    const materializeUninstall: ExtensionManager<SubagentExtensionRef>["materializeUninstall"] =
      Effect.fn("SubagentManager.materializeUninstall")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);

        // --- Read rendered files from lockfile ---
        const lockEntryOption = yield* ws.getLockedSubagent(target.name);
        if (Option.isSome(lockEntryOption)) {
          const lockEntry = lockEntryOption.value;
          const renderedFiles = lockEntry.renderedFiles ?? {};

          // --- Remove rendered files via CodingAgent.removeSubagent() ---
          const configuredAgents = yield* agentRepo
            .getConfiguredAgents()
            .pipe(Effect.provideService(WorkspaceMutations, ws));

          yield* Effect.forEach(
            configuredAgents,
            (agent) => {
              const agentFiles = renderedFiles[agent.id] ?? [];
              return agent
                .removeSubagent({
                  workspaceRoot: baseDir,
                  scope: "project",
                  subagentName: target.name,
                  renderedFilePaths: agentFiles.map((f) => f.path),
                })
                .pipe(Effect.provide(fsPathLayer));
            },
            { concurrency: "unbounded" },
          );
        }

        // --- Remove canonical source directory ---
        yield* removeFromAllCanonicalLocations(fs, baseDir, "subagents", sanitized, path);
      });

    return {
      type: "subagent",
      isInstalled: Effect.fn("SubagentManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: SubagentExtensionTarget;
      }) {
        const lockedSubagents = yield* ws.getLockedSubagents();
        return target.name in lockedSubagents;
      }),

      materializeInstall,
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: SubagentExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        const lockEntry = buildSubagentLockEntry(ref, agents, new Date());
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() => ws.setSubagent({ name: ref.subagent.name, lockEntry })),
            Effect.withSpan("SubagentManager.upsertSettingsEntry"),
          );
        }
        return ws
          .setSubagent({ name: ref.subagent.name, lockEntry })
          .pipe(Effect.withSpan("SubagentManager.upsertSettingsEntry"));
      },

      removeSettingsEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentSettings(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: SubagentExtensionRef }) => {
        const lockEntry = buildSubagentLockEntry(ref, agents, new Date());
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() => ws.setSubagentLock({ name: ref.subagent.name, lockEntry })),
            Effect.withSpan("SubagentManager.upsertLockfileEntry"),
          );
        }
        return ws
          .setSubagentLock({ name: ref.subagent.name, lockEntry })
          .pipe(Effect.withSpan("SubagentManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentLock(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeLockfileEntry")),
    } satisfies ExtensionManager<SubagentExtensionRef>;
  }),
);
