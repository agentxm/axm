import { withWork } from "@agentxm/host-primitives/work-observation";
/** Typed MCP manifest reads shared by projection and connection lifecycle. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import {
  McpServerManifestSchema,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

/** Decode the manifest at this path from one read of its text, mapping that read's failure. */
export const decodeMcpServerManifestRead = <R>(
  manifestPath: string,
  read: Effect.Effect<string, PlatformError.PlatformError, R>,
): Effect.Effect<McpServerManifest, McpConfigIoFailed | McpConfigInvalid, R> =>
  Effect.gen(function* () {
    const raw = yield* read.pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({
            detail: `Failed to read MCP server manifest: ${manifestPath}`,
            cause,
          }),
      ),
    );
    return yield* Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => {
          const value: unknown = JSON.parse(raw);
          return value;
        },
        catch: () =>
          new McpConfigInvalid({ detail: `Invalid JSON in MCP server manifest: ${manifestPath}` }),
      });
      return yield* Schema.decodeUnknownEffect(McpServerManifestSchema)(parsed).pipe(
        Effect.mapError(
          () =>
            new McpConfigInvalid({
              detail: `Invalid MCP server manifest: ${manifestPath}; input values are withheld`,
            }),
        ),
      );
    }).pipe((effect) =>
      withWork("axm.parse.manifest", effect, {
        attributes: { "axm.manifest.kind": "mcp", "axm.work.count": 1 },
      }),
    );
  });

export const decodeMcpServerManifestAt = (
  manifestPath: string,
): Effect.Effect<McpServerManifest, McpConfigIoFailed | McpConfigInvalid, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* decodeMcpServerManifestRead(manifestPath, fs.readFileString(manifestPath));
  });

/** Absence is optional; unreadable or invalid manifests remain typed failures. */
export const readMcpServerManifestAt = (
  canonicalPath: string,
): Effect.Effect<
  Option.Option<McpServerManifest>,
  McpConfigIoFailed | McpConfigInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(canonicalPath, manifestFilenameForType("mcp-server"));
    const exists = yield* fs.exists(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({
            detail: `Failed to inspect MCP server manifest: ${manifestPath}`,
            cause,
          }),
      ),
    );
    if (!exists) return Option.none();
    return Option.some(yield* decodeMcpServerManifestAt(manifestPath));
  });
