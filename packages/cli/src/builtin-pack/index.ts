/**
 * Builtin pack module — identity, assets, and resolution for @axm/cli.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeCliError } from "../cli-error/index.js";
import { PackManifestSchema } from "../extensions/packs/manifest-schema.js";
import type { PackManifest } from "../extensions/packs/manifest-schema.js";

// -----------------------------------------------------------------------------
// Identity Constants
// -----------------------------------------------------------------------------

export const BUILTIN_PACK_FQN = "@axm/cli";
export const BUILTIN_PACK_SCOPE = "@axm";
export const BUILTIN_PACK_NAME = "cli";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ResolvedBuiltinPack {
  readonly manifest: PackManifest;
  readonly version: string;
  readonly skillsDir: string;
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves the bundled builtin pack manifest and CLI version.
 * Reads axm-pack.json relative to this module's location.
 */
export const resolveBuiltinPack = Effect.fn("BuiltinPack.resolve")(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Resolve paths relative to this module
    const moduleDir = path.dirname(new URL(import.meta.url).pathname);
    const manifestPath = path.join(moduleDir, "axm-pack.json");
    const skillsDir = path.join(moduleDir, "skills");

    // Read and parse manifest
    const content = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "BUILTIN_PACK_READ_FAILED",
          what: "Failed to read builtin pack manifest",
          cause: e,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (e) =>
        makeCliError({
          code: "BUILTIN_PACK_PARSE_FAILED",
          what: "Failed to parse builtin pack manifest",
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknown(PackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "BUILTIN_PACK_PARSE_FAILED",
          what: "Failed to validate builtin pack manifest",
          cause: e,
        }),
      ),
    );

    return { manifest, version: manifest.version, skillsDir } satisfies ResolvedBuiltinPack;
  });
