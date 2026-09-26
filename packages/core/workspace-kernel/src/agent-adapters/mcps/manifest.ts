/** Typed MCP manifest reads shared by projection and connection lifecycle. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";

export const decodeMcpServerManifestAt = (
  manifestPath: string,
): Effect.Effect<McpServerManifest, McpConfigIoFailed | McpConfigInvalid, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigIoFailed({
            detail: `Failed to read MCP server manifest: ${manifestPath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(raw);
        return value;
      },
      catch: (cause) =>
        new McpConfigInvalid({
          detail: `Invalid JSON in MCP server manifest: ${manifestPath}`,
          cause,
        }),
    });
    return yield* Schema.decodeUnknownEffect(McpServerManifestSchema)(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new McpConfigInvalid({ detail: `Invalid MCP server manifest: ${manifestPath}`, cause }),
      ),
    );
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
    const manifestPath = path.join(canonicalPath, MCP_SERVER_MANIFEST_FILENAME);
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
