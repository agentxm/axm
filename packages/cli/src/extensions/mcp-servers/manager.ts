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
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { isPathSafe } from "../../utils/path-safety.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../../sources/index.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import type {
  ExtensionManager,
  McpServerExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace } from "../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../index.js";
import { computeIntegrity } from "../../utils/integrity.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>()("@axm.sh/cli/McpServerManager") {}

// Build lock entry from registry ref
const buildMcpServerLockEntry = (ref: RegistryMcpServerRef, now: Date): McpServerLockEntry => ({
  type: "registry",
  profile: ref.profile,
  name: ref.name,
  resolvedVersion: ref.version,
  integrity: ref.integrity,
  sourceName: "default",
  installedAt: now,
  updatedAt: now,
});

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const McpServerManagerLive = Layer.effect(
  McpServerManager,
  Effect.gen(function* () {
    const ws = yield* Workspace;
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
      Effect.fn("McpServerManager.materializeInstall")(
        function* ({ ref }) {
        if (ref.refType !== "registry") {
          return yield* makeAppError({
            code: "INSTALL_MCP_SERVER_UNSUPPORTED_REF_TYPE",
            what: `Unsupported ref type for MCP server install: ${ref.refType}`,
          });
        }

        const registryRef = ref as RegistryMcpServerRef;
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          registryRef.profile,
          "mcp-servers",
          registryRef.name,
        );

        if (!isPathSafe(baseDir, canonicalPath)) {
          return yield* makeAppError({
            code: "INSTALL_MCP_SERVER_PATH_TRAVERSAL",
            what: `Path traversal detected: ${canonicalPath}`,
          });
        }

        const canonicalExists = yield* fs.exists(canonicalPath).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "INSTALL_MCP_SERVER_PATH_CHECK_FAILED",
              what: `Failed to check if canonical path exists: ${canonicalPath}`,
              cause: e,
            }),
          ),
        );
        const useExisting = registryRef.integrity === "" && canonicalExists;

        if (!useExisting) {
          const locationStr =
            registryRef.source.location.protocol === "file:"
              ? registryRef.source.location.pathname
              : registryRef.source.location.href;
          const client = yield* provide(createRegistryClient(locationStr));
          const { archive } = yield* client.getExtensionPackage({
            handle: registryRef.profile,
            type: "mcp-server",
            name: registryRef.name,
            version: Option.some(registryRef.version),
          });

          if (registryRef.integrity !== "") {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== registryRef.integrity) {
              return yield* makeAppError({
                code: "INSTALL_MCP_SERVER_INTEGRITY_MISMATCH",
                what: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
                details: [`Expected ${registryRef.integrity}, got ${actualIntegrity}`],
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "INSTALL_MCP_SERVER_TEMP_DIR_FAILED",
                what: `Failed to create temporary directory for registry install`,
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
                    code: "INSTALL_MCP_SERVER_COPY_FAILED",
                    what: `Failed to create canonical directory: ${canonicalPath}`,
                    cause: e,
                  }),
                ),
              );
              const entries = yield* fs.readDirectory(tmpDir).pipe(
                Effect.mapError((e) =>
                  makeAppError({
                    code: "INSTALL_MCP_SERVER_COPY_FAILED",
                    what: `Failed to read extracted directory`,
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
      },
        Effect.asVoid,
      );

    const materializeUninstall: ExtensionManager<McpServerExtensionRef>["materializeUninstall"] =
      Effect.fn("McpServerManager.materializeUninstall")(
        function* ({ target }) {
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
            const serverPath = path.join(extensionsDir, scopeDir, "mcp-servers", target.name);
            return fs.remove(serverPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
          },
          { concurrency: "unbounded" },
        );
      },
        Effect.asVoid,
      );

    return {
      extensionType: "mcp-server",

      materializeInstall,
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("McpServerManager.upsertSettingsEntry"));
        const registryRef = ref as RegistryMcpServerRef;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef, new Date());
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
        const registryRef = ref as RegistryMcpServerRef;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef, new Date());
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
