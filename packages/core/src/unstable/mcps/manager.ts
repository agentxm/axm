/**
 * MCP server extension manager service.
 *
 * Implements ExtensionManager<McpServerExtensionRef>. Delegates to existing
 * MCP server materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { computeIntegrity, isPathSafe } from "../utils/index.js";
import { configuredMcpServersToDiskRefs } from "../extensions/materializable-from-disk.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "./refs.js";
import type { McpServerLockEntry } from "../lockfile/index.js";
import type { ExtensionManager, McpServerExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR, shouldReuseCanonicalInstall } from "../extensions/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { removeMcpServerFromManifest } from "../agents/mcp-sync.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>()("@agentxm/client-core/unstable/mcps/manager/McpServerManager") {}

// Build lock entry from registry ref
const buildMcpServerLockEntry = (
  ref: RegistryMcpServerRef,
  now: DateTime.Utc,
): McpServerLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
  installedAt: now,
  updatedAt: now,
});

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcps", serverName);
        return fsService.exists(serverPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const McpServerManagerLive = Layer.effect(
  McpServerManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    const materializeInstall: ExtensionManager<McpServerExtensionRef>["materializeInstall"] =
      Effect.fn("McpServerManager.materializeInstall")(function* ({ ref, force }) {
        if (ref.refType !== "registry") {
          return yield* makeAppError({
            code: "internal",
            detail: `Unsupported ref type for MCP server install: ${ref.refType}`,
          });
        }

        const registryRef = ref;
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          registryRef.owner,
          "mcps",
          registryRef.name,
        );

        if (!isPathSafe(baseDir, canonicalPath)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Path traversal detected: ${canonicalPath}`,
          });
        }

        const canonicalExists = yield* fs.exists(canonicalPath).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "internal",
              detail: `Failed to check if canonical path exists: ${canonicalPath}`,
              cause: e,
            }),
          ),
        );
        const lockedEntry = yield* ws
          .getLockedMcpServer(registryRef.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const lockedVersion = Option.match(lockedEntry, {
          onNone: () => undefined,
          onSome: (entry) => (entry.type === "registry" ? entry.resolvedVersion : undefined),
        });
        const useExisting = shouldReuseCanonicalInstall({
          canonicalExists,
          force: force === true,
          hasIntegrity: Option.isSome(registryRef.integrity),
          refVersion: registryRef.version,
          lockedVersion,
        });

        if (!useExisting) {
          const locationStr =
            registryRef.source.location.protocol === "file:"
              ? registryRef.source.location.pathname
              : registryRef.source.location.href;
          const client = yield* provide(createRegistryClient(locationStr));
          const { archive } = yield* client.getExtensionPackage({
            owner: registryRef.owner,
            type: "mcp-server",
            name: registryRef.name,
            version: Option.some(registryRef.version),
          });

          if (Option.isSome(registryRef.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== registryRef.integrity.value) {
              return yield* makeAppError({
                code: "internal",
                detail: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
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
              yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
                Effect.mapError((e) =>
                  makeAppError({
                    code: "validation",
                    detail: `Failed to create canonical directory: ${canonicalPath}`,
                    cause: e,
                  }),
                ),
              );
              const entries = yield* fs.readDirectory(tmpDir).pipe(
                Effect.mapError((e) =>
                  makeAppError({
                    code: "validation",
                    detail: `Extracted directory could not be read`,
                    cause: e,
                  }),
                ),
              );
              yield* Effect.forEach(
                entries,
                (entry) => {
                  const src = path.join(tmpDir, entry);
                  const dest = path.join(canonicalPath, entry);
                  return fs.copy(src, dest).pipe(Effect.ignore);
                },
                { concurrency: "unbounded" },
              );
            }),
            fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
          );
        }
      }, Effect.asVoid);

    const materializeUninstall: ExtensionManager<McpServerExtensionRef>["materializeUninstall"] =
      Effect.fn("McpServerManager.materializeUninstall")(function* ({ target, preserveSource }) {
        const configuredAgents = yield* ws
          .getConfiguredAgents()
          .pipe(Effect.catch(() => Effect.succeed([])));

        yield* Effect.forEach(
          configuredAgents,
          (agentId) =>
            provide(
              removeMcpServerFromManifest(agentId, {
                workspaceRoot: baseDir,
                scope: ws.scope,
                serverName: target.name,
              }),
            ).pipe(Effect.catch(() => Effect.void)),
          { concurrency: "unbounded" },
        );

        if (preserveSource === true) return;
        const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
        const extensionsDirExists = yield* fs
          .exists(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed(false)));

        if (!extensionsDirExists) return;

        const scopeDirs = yield* fs
          .readDirectory(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

        yield* Effect.forEach(
          scopeDirs,
          (scopeDir) => {
            if (!scopeDir.startsWith("@")) return Effect.void;
            const serverPath = path.join(extensionsDir, scopeDir, "mcps", target.name);
            return fs.remove(serverPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
          },
          { concurrency: "unbounded" },
        );
      }, Effect.asVoid);

    return {
      type: "mcp-server",
      isInstalled: Effect.fn("McpServerManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: McpServerExtensionTarget;
      }) {
        const installedMcpServers = yield* ws.records.getInstalledMcpServers();
        if (target.name in installedMcpServers) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      getConfiguredSource: Effect.fn("McpServerManager.getConfiguredSource")(function* ({
        target,
      }) {
        const configured = yield* ws.records.getConfiguredMcpServers();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("McpServerManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredMcpServers();
        return yield* configuredMcpServersToDiskRefs(
          { fs, path, baseDir, scope: ws.scope },
          configured,
        );
      }),
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly versionRange: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("McpServerManager.upsertSettingsEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => DateTime.now),
          Effect.flatMap((now) => {
            const lockEntry = buildMcpServerLockEntry(registryRef, now);
            return ws.setMcpServer({ name: ref.server.name, lockEntry });
          }),
          Effect.withSpan("McpServerManager.upsertSettingsEntry"),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerSettings(target.name)
          .pipe(Effect.withSpan("McpServerManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: McpServerExtensionRef }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("McpServerManager.upsertLockfileEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => DateTime.now),
          Effect.flatMap((now) => {
            const lockEntry = buildMcpServerLockEntry(registryRef, now);
            return ws.setMcpServerLock({ name: ref.server.name, lockEntry });
          }),
          Effect.withSpan("McpServerManager.upsertLockfileEntry"),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerLock(target.name)
          .pipe(Effect.withSpan("McpServerManager.removeLockfileEntry")),
    } satisfies ExtensionManager<McpServerExtensionRef>;
  }),
);
