/**
 * What a scaffold for one extension type contributes to a creation.
 *
 * Everything that differs between the seven types — the manifest, the starter
 * body, the file the author edits next, the initial version — is decided
 * here; everything they share — ownership, naming, the canonical location,
 * the create-only preflight, desired state, projection, the transaction — is
 * decided once by the create use case.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { Version } from "@agentxm/extension-model/unstable/version-constraints";

import { AuthoringFailed } from "../../errors.js";

/** One extension type's contribution to a creation. */
export interface AuthoredScaffold {
  /** Sentence-cased subject used in refusals, e.g. `Knowledge bundle`. */
  readonly subject: string;
  /** Version the scaffolded manifest carries. */
  readonly version: Version;
  /**
   * Package-relative files the scaffold writes, in the order a plan lists
   * them. They are also the files the canonical staging requires before the
   * package is swapped into place.
   */
  readonly contentFiles: ReadonlyArray<string>;
  /** Package-relative file the author edits next. */
  readonly entryFile: string;
  /** Write the package body into a staging directory. */
  readonly populate: (
    stagingPath: string,
  ) => Effect.Effect<void, AuthoringFailed, FileSystem.FileSystem | Path.Path>;
}

/** Serialize a manifest the way every authored manifest is written. */
export const manifestText = (manifest: unknown): string => `${JSON.stringify(manifest, null, 2)}\n`;

/**
 * Create a directory inside the staging tree, reporting the failure as an
 * authoring failure rather than a raw platform error.
 */
export const stageDirectory = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "internal",
            detail: `Failed to create the staged directory ${directory}`,
            cause,
          }),
      ),
    );
  });

/** Write one staged file, naming the file in the failure. */
export const stageFile = (args: { readonly path: string; readonly contents: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(args.path, args.contents).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "internal",
            detail: `Failed to write the staged file ${args.path}`,
            cause,
          }),
      ),
    );
  });

/** Stage a file and every directory above it inside the staging tree. */
export const stageFileAt = (args: { readonly path: string; readonly contents: string }) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* stageDirectory(path.dirname(args.path));
    yield* stageFile(args);
  });
