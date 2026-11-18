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
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  type ExtensionFileAccessor,
  makeManifestJsonParseFailure,
} from "@agentxm/extension-content/lint";

const decoder = new TextDecoder();

/**
 * Read and parse a manifest as {@link readManifestJson} does, also returning
 * the text it decoded: `Some` whenever the bytes were read, even when the text
 * is not valid JSON.
 */
export const readManifestJsonCapture = (
  accessor: ExtensionFileAccessor,
  filename: string,
): Effect.Effect<{ readonly json: unknown | undefined; readonly text: Option.Option<string> }> =>
  Effect.gen(function* () {
    const exists = yield* accessor.exists(filename);
    if (!exists) {
      return { json: undefined, text: Option.none() };
    }

    const bytes = yield* accessor.readBytes(filename).pipe(Effect.catch(() => Effect.void));
    if (bytes === undefined) {
      return { json: undefined, text: Option.none() };
    }

    const raw = decoder.decode(bytes);
    const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(raw).pipe(
      Effect.catch(() => Effect.succeed(makeManifestJsonParseFailure(filename))),
    );
    return { json, text: Option.some(raw) };
  });

export const readManifestJson = (
  accessor: ExtensionFileAccessor,
  filename: string,
): Effect.Effect<unknown | undefined> =>
  readManifestJsonCapture(accessor, filename).pipe(Effect.map((capture) => capture.json));
