/**
 * MCP server extension manager service.
 *
 * Implements ExtensionManager<McpServerExtensionRef>. Delegates to existing
 * MCP server materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeCliError } from "../../cli-error/index.js";
import { isPathSafe } from "../../utils/path-safety.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../../sources/types.js";
import type { McpServerLockEntry } from "../../lockfile/schema.js";
import type {
  ExtensionManager,
  McpServerExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace } from "../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import { computeIntegrity } from "../../utils/integrity.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class McpServerManager extends Context.Tag("McpServerManager")<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>() {}

// Build lock entry from registry ref
const buildMcpServerLockEntry = (ref: RegistryMcpServerRef, now: Date): McpServerLockEntry => ({
  type: "registry",
  namespace: ref.namespace,
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

    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, fsPathLayer);

    return {
      extensionType: "mcp-server",

      materializeInstall: ({ ref }: { readonly ref: McpServerExtensionRef }) =>
        Effect.gen(function* () {
          if (ref.refType !== "registry") {
            return yield* makeCliError({
              code: "INSTALL_MCP_SERVER_UNSUPPORTED_REF_TYPE",
              what: `Unsupported ref type for MCP server install: ${ref.refType}`,
            });
          }

          const registryRef = ref as RegistryMcpServerRef;
          const canonicalPath = path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            registryRef.namespace,
            "mcp-servers",
            registryRef.name,
          );

          if (!isPathSafe(baseDir, canonicalPath)) {
            return yield* makeCliError({
              code: "INSTALL_MCP_SERVER_PATH_TRAVERSAL",
              what: `Path traversal detected: ${canonicalPath}`,
            });
          }

          const canonicalExists = yield* fs.exists(canonicalPath).pipe(
            Effect.mapError((e) =>
              makeCliError({
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
              namespace: registryRef.namespace,
              type: "mcp-server",
              name: registryRef.name,
              version: Option.some(registryRef.version),
            });

            if (registryRef.integrity !== "") {
              const actualIntegrity = yield* computeIntegrity(archive);
              if (actualIntegrity !== registryRef.integrity) {
                return yield* makeCliError({
                  code: "INSTALL_MCP_SERVER_INTEGRITY_MISMATCH",
                  what: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
                  details: [`Expected ${registryRef.integrity}, got ${actualIntegrity}`],
                });
              }
            }

            const tmpDir = yield* fs.makeTempDirectory().pipe(
              Effect.mapError((e) =>
                makeCliError({
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
                    makeCliError({
                      code: "INSTALL_MCP_SERVER_COPY_FAILED",
                      what: `Failed to create canonical directory: ${canonicalPath}`,
                      cause: e,
                    }),
                  ),
                );
                const entries = yield* fs.readDirectory(tmpDir).pipe(
                  Effect.mapError((e) =>
                    makeCliError({
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
                    return fs.copy(src, dest).pipe(Effect.ignoreLogged);
                  },
                  { concurrency: "unbounded" },
                );
              }),
              fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
            );
          }
        }),

      materializeUninstall: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        Effect.gen(function* () {
          const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
          const extensionsDirExists = yield* fs
            .exists(extensionsDir)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (!extensionsDirExists) return;

          const scopeDirs = yield* fs
            .readDirectory(extensionsDir)
            .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

          yield* Effect.forEach(
            scopeDirs,
            (scopeDir) => {
              if (!scopeDir.startsWith("@")) return Effect.void;
              const serverPath = path.join(extensionsDir, scopeDir, "mcp-servers", target.name);
              return fs
                .remove(serverPath, { recursive: true })
                .pipe(Effect.catchAll(() => Effect.void));
            },
            { concurrency: "unbounded" },
          );
        }),

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry") return Effect.void;
        const registryRef = ref as RegistryMcpServerRef;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef, new Date());
            return ws.setMcpServer({ name: ref.server.name, lockEntry });
          }),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws.removeMcpServerSettings(target.name),

      upsertLockfileEntry: ({ ref }: { readonly ref: McpServerExtensionRef }) => {
        if (ref.refType !== "registry") return Effect.void;
        const registryRef = ref as RegistryMcpServerRef;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef, new Date());
            return ws.setMcpServerLock({ name: ref.server.name, lockEntry });
          }),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws.removeMcpServerLock(target.name),
    } satisfies ExtensionManager<McpServerExtensionRef>;
  }),
);
