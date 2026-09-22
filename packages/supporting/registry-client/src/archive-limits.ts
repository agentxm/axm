import type * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { RegistryOperationFailed } from "./errors.js";

/** Maximum compressed archive bytes admitted to the in-memory acquisition path. */
export const MAX_BUFFERED_ARCHIVE_BYTES = 50 * 1024 * 1024;

/** Maximum extracted bytes retained before publishing a package tree. */
export const MAX_EXTRACTED_ARCHIVE_BYTES = 256 * 1024 * 1024;

/** Prevent a tiny archive from creating an unbounded number of filesystem entries. */
export const MAX_ARCHIVE_ENTRIES = 10_000;

const archiveTooLarge = (maxBytes: number) =>
  new RegistryOperationFailed({
    category: "quota",
    detail: `Registry archive exceeds the ${maxBytes} byte acquisition limit`,
  });

/** Read from disk with a byte cap even if the file changes after its size check. */
export const readBufferedArchive = (
  fs: FileSystem.FileSystem,
  path: string,
  maxBytes = MAX_BUFFERED_ARCHIVE_BYTES,
) =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new RegistryOperationFailed({
        category: "validation",
        detail: "Archive read limit must be a positive finite integer",
      });
    }
    const limit = Math.min(maxBytes, MAX_BUFFERED_ARCHIVE_BYTES);
    const info = yield* fs.stat(path);
    if (Number(info.size) > limit) return yield* archiveTooLarge(limit);
    const received = yield* Ref.make(0);
    const chunks = yield* fs.stream(path, { chunkSize: 64 * 1024 }).pipe(
      Stream.mapEffect((chunk) =>
        Effect.gen(function* () {
          const next = (yield* Ref.get(received)) + chunk.byteLength;
          if (next > limit) return yield* archiveTooLarge(limit);
          yield* Ref.set(received, next);
          return chunk;
        }),
      ),
      Stream.runCollect,
    );
    const archive = new Uint8Array(yield* Ref.get(received));
    let offset = 0;
    for (const chunk of chunks) {
      archive.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return archive;
  });
