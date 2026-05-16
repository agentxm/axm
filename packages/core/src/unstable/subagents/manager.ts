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
    const materializeFromRegistry = (ref: RegistrySubagentRef, canonicalPath: string) =>
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
          yield* Effect.ensuring(
            Effect.gen(function* () {
              yield* provide(extractZip(archive, tmpDir));
              yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
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
        yield* Effect.forEach(
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
              .pipe(Effect.provide(fsPathLayer), Effect.asVoid),
          { concurrency: "unbounded" },
        );
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
      listMaterializable: Effect.fn("SubagentManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredSubagents();
        return yield* configuredSubagentsToDiskRefs({ fs, path, baseDir }, configured);
      }),
      materializeUninstall,

      upsertSettingsEntry: Effect.fn("SubagentManager.upsertSettingsEntry")(function* ({
        ref,
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
        const lockEntry = buildSubagentLockEntry(
          ref,
          agents,
          new Date(),
          workspaceRelativeLocalSourcePath,
        );
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagent({ name: ref.subagent.name, lockEntry });
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
        const lockEntry = buildSubagentLockEntry(
          ref,
          agents,
          new Date(),
          workspaceRelativeLocalSourcePath,
        );
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `subagents.${ref.subagent.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSubagentLock({ name: ref.subagent.name, lockEntry });
      }),

      removeLockfileEntry: ({ target }: { readonly target: SubagentExtensionTarget }) =>
        ws
          .removeSubagentLock(target.name)
          .pipe(Effect.withSpan("SubagentManager.removeLockfileEntry")),
    } satisfies ExtensionManager<SubagentExtensionRef>;
  }),
);
