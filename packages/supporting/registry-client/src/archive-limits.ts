import type * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
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

interface ArchiveBuffer {
  readonly bytes: Uint8Array;
  readonly received: number;
}

/** Collect a capped body into one growable buffer instead of retaining every source chunk. */
export const collectBufferedArchive = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  maxBytes = MAX_BUFFERED_ARCHIVE_BYTES,
  expectedBytes?: number,
  onChunk: (received: number) => Effect.Effect<void> = () => Effect.void,
): Effect.Effect<Uint8Array, E | RegistryOperationFailed, R> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new RegistryOperationFailed({
        category: "validation",
        detail: "Archive read limit must be a positive finite integer",
      });
    }
    const limit = Math.min(maxBytes, MAX_BUFFERED_ARCHIVE_BYTES);
    if (expectedBytes !== undefined && expectedBytes > limit) return yield* archiveTooLarge(limit);
    const initialCapacity = Math.min(limit, Math.max(64 * 1024, expectedBytes ?? 0));
    const collected = yield* Stream.runFoldEffect(
      stream,
      (): ArchiveBuffer => ({ bytes: new Uint8Array(initialCapacity), received: 0 }),
      (current, chunk) =>
        Effect.gen(function* () {
          const received = current.received + chunk.byteLength;
          if (received > limit) return yield* archiveTooLarge(limit);
          let bytes = current.bytes;
          if (received > bytes.byteLength) {
            const grown = new Uint8Array(Math.min(limit, Math.max(received, bytes.byteLength * 2)));
            grown.set(bytes.subarray(0, current.received));
            bytes = grown;
          }
          bytes.set(chunk, current.received);
          yield* onChunk(received);
          return { bytes, received } satisfies ArchiveBuffer;
        }),
    );
    return collected.bytes.subarray(0, collected.received);
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
    return yield* collectBufferedArchive(
      fs.stream(path, { chunkSize: 64 * 1024 }),
      limit,
      Number(info.size),
    );
  });
