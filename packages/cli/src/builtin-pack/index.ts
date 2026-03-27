/**
 * Builtin pack module — identity, assets, and resolution for @axm/cli.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { PackManifestSchema } from "@axm.sh/core/unstable/extensions";
import type { ResolvedBuiltinPack } from "@axm.sh/core/unstable/workspace";

export {
  BUILTIN_PACK_FQN,
  BUILTIN_PACK_SCOPE,
  BUILTIN_PACK_NAME,
  type ResolvedBuiltinPack,
} from "@axm.sh/core/unstable/workspace";

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
      makeAppError({
        code: "BUILTIN_PACK_READ_FAILED",
        what: "Failed to read builtin pack manifest",
        cause: e,
      }),
    ),
  );

  const json = yield* Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(content);
      return parsed;
    },
    catch: (e) =>
      makeAppError({
        code: "BUILTIN_PACK_PARSE_FAILED",
        what: "Failed to parse builtin pack manifest",
        cause: e,
      }),
  });

  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "BUILTIN_PACK_PARSE_FAILED",
        what: "Failed to validate builtin pack manifest",
        cause: e,
      }),
    ),
  );

  return { manifest, version: manifest.version, skillsDir } satisfies ResolvedBuiltinPack;
});
