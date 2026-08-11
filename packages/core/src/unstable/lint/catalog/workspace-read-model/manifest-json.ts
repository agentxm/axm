/**
 * Manifest JSON reader for workspace lint projections.
 *
 * Reads through the already-rooted per-extension file accessor, parses loose
 * JSON, and returns the raw parsed value. It intentionally does not decode
 * against a manifest schema because unknown keys must remain visible to the
 * `*-keys-recognized` rules.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { PackFileAccessor } from "../../context.js";
import { makeManifestJsonParseFailure } from "../shared/manifest-json.js";

const decoder = new TextDecoder();

export const readManifestJson = (
  accessor: PackFileAccessor,
  filename: string,
): Effect.Effect<unknown | undefined> =>
  Effect.gen(function* () {
    const exists = yield* accessor.exists(filename);
    if (!exists) {
      return undefined;
    }

    const bytes = yield* accessor.readBytes(filename).pipe(Effect.catch(() => Effect.void));
    if (bytes === undefined) {
      return undefined;
    }

    const raw = decoder.decode(bytes);
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(raw).pipe(
      Effect.catch(() => Effect.succeed(makeManifestJsonParseFailure(filename))),
    );
  });
