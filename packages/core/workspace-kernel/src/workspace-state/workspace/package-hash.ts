import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
/**
 * Content hashing for installed extension packages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
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
 * A caller that has just read the bytes of one root-level file passes them as
 * `rootFile`: when the walk finds a regular file under that name it frames
 * those bytes instead of reading the file again, with mode bits still taken
 * from the walk's own `lstat`; any other entry kind is framed as usual. A
 * caller that needs the text of some package-relative regular files names
 * them in `decodeText`; the walk hands each one's bytes, decoded as UTF-8
 * exactly as `readFileString` decodes them, to `receive` as it frames them.
 * Neither option changes the hash.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computePackageContentHash = (
  packageDir: string,
  options?: {
    readonly rootFile?: { readonly name: string; readonly bytes: Uint8Array };
    readonly decodeText?: {
      readonly entries: ReadonlyArray<string>;
      readonly receive: (relative: string, text: string) => void;
    };
  },
): Effect.Effect<SourceHash, PackageContentHashFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const decoded = new Set(options?.decodeText?.entries ?? []);
    const rootFile = options?.rootFile;
    const hash = crypto.createHash("sha256");
    let byteCount = 0;
    let entryCount = 0;
    const frame = (kind: string, relative: string, bytes: Uint8Array): void => {
      byteCount += bytes.byteLength;
      entryCount += 1;
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
          const info = yield* fs.lstat(absolute);
          if (info.type === "SymbolicLink") {
            const target = yield* fs.readLink(absolute);
            frame("symlink", relative, new TextEncoder().encode(target));
            continue;
          }
          if (info.type === "Directory") {
            frame("directory", relative, new Uint8Array());
            yield* walk(absolute, relative);
          } else if (info.type === "File") {
            const bytes =
              rootFile !== undefined && prefix === "" && entry === rootFile.name
                ? rootFile.bytes
                : yield* fs.readFile(absolute);
            frame(`file:${info.mode & 0o111}`, relative, bytes);
            if (decoded.has(relative))
              options?.decodeText?.receive(relative, new TextDecoder().decode(bytes));
          }
        }
      });
    yield* walk(packageDir, "").pipe(
      Effect.ensuring(
        Effect.suspend(() =>
          annotateWork({
            "axm.work.bytes": byteCount,
            "axm.work.count": entryCount,
          }),
        ),
      ),
    );
    return yield* computeSourceHash(hash.digest("hex"));
  }).pipe(
    Effect.mapError((cause) => new PackageContentHashFailed({ packageDir, cause })),
    (effect) => withWork("axm.hash.package", effect),
  );
