/**
 * Content hashing for installed extension packages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import type { PlatformError } from "effect/PlatformError";
import { PackageContentHashFailed } from "./errors.js";
import { computeSourceHash } from "./rendered-files.js";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";

/**
 * Compute an advisory SHA-256 change marker over package content recursively.
 *
 * Sorted entry frames distinguish paths, kinds, executable bits, bytes and
 * symbolic-link text. Links are never traversed, so contained directory cycles
 * remain ordinary payload entries. Acquisition owns link containment checks.
 *
 * The result is a change-detection marker for created/updated/unchanged
 * reporting, never a tamper seal — installed content is workspace-owned and
 * may be rewritten by content-preserving tools after install.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computePackageContentHash = (
  packageDir: string,
): Effect.Effect<SourceHash, PackageContentHashFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hash = crypto.createHash("sha256");
    const frame = (kind: string, relative: string, bytes: Uint8Array): void => {
      hash.update(kind);
      hash.update("\0");
      hash.update(relative);
      hash.update("\0");
      hash.update(`${bytes.byteLength}\0`);
      hash.update(bytes);
    };
    const walk = (directory: string, prefix: string): Effect.Effect<void, PlatformError> =>
      Effect.gen(function* () {
        const entries = [...(yield* fs.readDirectory(directory))].sort();
        for (const entry of entries) {
          const absolute = path.join(directory, entry);
          const relative = prefix === "" ? entry : `${prefix}/${entry}`;
          const link = yield* fs.readLink(absolute).pipe(Effect.option);
          if (Option.isSome(link)) {
            frame("symlink", relative, new TextEncoder().encode(link.value));
            continue;
          }
          const info = yield* fs.stat(absolute);
          if (info.type === "Directory") {
            frame("directory", relative, new Uint8Array());
            yield* walk(absolute, relative);
          } else if (info.type === "File") {
            frame(`file:${info.mode & 0o111}`, relative, yield* fs.readFile(absolute));
          }
        }
      });
    yield* walk(packageDir, "");
    return computeSourceHash(hash.digest("hex"));
  }).pipe(Effect.mapError((cause) => new PackageContentHashFailed({ packageDir, cause })));
