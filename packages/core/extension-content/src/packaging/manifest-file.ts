/** Read and validate a package manifest from its owning directory. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ManifestError,
  ManifestIdentitySchema,
  manifestSchemaForType,
  type ExtensionManifest,
  type ManifestIdentity,
} from "./manifest-policy.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

interface ReadManifestOptions {
  readonly defaultOwner?: Handle;
  /**
   * The manifest file's text as the caller has just read it, decoded in place
   * of reading the file again.
   */
  readonly text?: string;
  /**
   * Read the manifest file's bytes, hand them to this callback, and decode
   * the text from them exactly as `readFileString` would.
   */
  readonly receiveBytes?: (bytes: Uint8Array) => void;
}

/** The manifest a package of `T` declares. */
type ManifestOfType<T extends ExtensionType> = Extract<ExtensionManifest, { readonly type: T }>;

interface ReadManifestResult<T extends ExtensionType> {
  readonly path: string;
  readonly fileName: string;
  readonly raw: unknown;
  readonly manifest: ManifestOfType<T>;
  readonly identity: ManifestIdentity;
}

const isManifestOfType = <T extends ExtensionType>(
  manifest: ExtensionManifest,
  type: T,
): manifest is ManifestOfType<T> => manifest.type === type;

const withDefaultOwner = (raw: unknown, defaultOwner: Handle | undefined): unknown =>
  defaultOwner !== undefined && Predicate.isObject(raw) && !Object.hasOwn(raw, "owner")
    ? { ...raw, owner: defaultOwner }
    : raw;

/**
 * Read the manifest content. Absence is judged from the read itself; only
 * another failure probes the path, to tell an uninspectable location from an
 * unreadable file exactly as an existence check before the read would.
 */
const readManifestContent = <A>(
  fs: FileSystem.FileSystem,
  read: Effect.Effect<A, PlatformError>,
  directory: string,
  fileName: string,
  manifestPath: string,
): Effect.Effect<A, ManifestError> => {
  const missing = () =>
    new ManifestError({
      code: "manifest_missing",
      detail: `Expected manifest file "${fileName}" not found in ${directory}.`,
    });
  return read.pipe(
    Effect.catch((readError) =>
      readError.reason._tag === "NotFound"
        ? Effect.fail(missing())
        : fs.exists(manifestPath).pipe(
            Effect.mapError(
              (cause) =>
                new ManifestError({
                  code: "manifest_unreadable",
                  detail: `Manifest file "${manifestPath}" could not be inspected.`,
                  cause,
                }),
            ),
            Effect.flatMap((exists) =>
              Effect.fail(
                exists
                  ? new ManifestError({
                      code: "manifest_unreadable",
                      detail: `Manifest file "${manifestPath}" could not be read.`,
                      cause: readError,
                    })
                  : missing(),
              ),
            ),
          ),
    ),
  );
};

/** The manifest text: supplied by the caller, decoded from bytes it receives, or read. */
const manifestText = (
  fs: FileSystem.FileSystem,
  directory: string,
  fileName: string,
  manifestPath: string,
  options: ReadManifestOptions | undefined,
): Effect.Effect<string, ManifestError> => {
  if (options?.text !== undefined) return Effect.succeed(options.text);
  const receiveBytes = options?.receiveBytes;
  if (receiveBytes === undefined)
    return readManifestContent(
      fs,
      fs.readFileString(manifestPath),
      directory,
      fileName,
      manifestPath,
    );
  return readManifestContent(fs, fs.readFile(manifestPath), directory, fileName, manifestPath).pipe(
    Effect.map((bytes) => {
      const text = new TextDecoder().decode(bytes);
      receiveBytes(bytes);
      return text;
    }),
  );
};

const decodeManifestText = <T extends ExtensionType>(
  content: string,
  type: T,
  fileName: string,
  manifestPath: string,
  options: ReadManifestOptions | undefined,
): Effect.Effect<ReadManifestResult<T>, ManifestError> =>
  Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      content,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_invalid_json",
            detail: `Manifest file "${fileName}" contains invalid JSON.`,
            cause,
          }),
      ),
    );
    const raw = withDefaultOwner(parsed, options?.defaultOwner);
    const decoded = yield* Schema.decodeUnknownEffect(manifestSchemaForType(type))(
      raw,
      type === "hook" ? { onExcessProperty: "error" } : undefined,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_schema_invalid",
            detail: `Manifest file "${fileName}" does not conform to the ${type} manifest schema.`,
            details: SchemaIssue.makeFormatterDefault()(cause.issue),
          }),
      ),
    );
    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(decoded).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_schema_invalid",
            detail: `Manifest file "${fileName}" is missing required identity fields.`,
            details: SchemaIssue.makeFormatterDefault()(cause.issue),
          }),
      ),
    );
    if (!isManifestOfType(decoded, type)) {
      return yield* new ManifestError({
        code: "manifest_schema_invalid",
        detail: `Manifest declared type "${identity.type}" disagrees with ${fileName}.`,
      });
    }
    return { path: manifestPath, fileName, raw, manifest: decoded, identity };
  });

/**
 * Read and validate a manifest, also returning the text it read: `Some`
 * whenever the read succeeded, even when the text fails to decode.
 */
export const readExtensionManifestCapture = <T extends ExtensionType>(
  directory: string,
  type: T,
  options?: ReadManifestOptions,
): Effect.Effect<
  {
    readonly result: Result.Result<ReadManifestResult<T>, ManifestError>;
    readonly text: Option.Option<string>;
  },
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fileName = manifestFilenameForType(type);
    const manifestPath = path.join(directory, fileName);
    const content = yield* manifestText(fs, directory, fileName, manifestPath, options).pipe(
      Effect.result,
    );
    if (Result.isFailure(content)) {
      return { result: Result.fail(content.failure), text: Option.none() };
    }
    const result = yield* decodeManifestText(
      content.success,
      type,
      fileName,
      manifestPath,
      options,
    ).pipe(Effect.result);
    return { result, text: Option.some(content.success) };
  });

export const readExtensionManifest = <T extends ExtensionType>(
  directory: string,
  type: T,
  options?: ReadManifestOptions,
): Effect.Effect<ReadManifestResult<T>, ManifestError, FileSystem.FileSystem | Path.Path> =>
  readExtensionManifestCapture(directory, type, options).pipe(
    Effect.flatMap((capture) => Effect.fromResult(capture.result)),
  );
