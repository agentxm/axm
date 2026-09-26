import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { MAX_ACQUIRED_TREE_BYTES } from "@agentxm/registry-client";

export const MAX_ACQUIRED_TREE_ENTRIES = 10_000;

export class AcquiredTreeLimitExceeded extends Data.TaggedError("AcquiredTreeLimitExceeded")<{
  readonly resource: "bytes" | "entries";
  readonly limit: number;
}> {}

/** Count a staged tree before it is admitted to the operation's retained scratch. */
export const measureAcquiredTree = (
  directory: string,
  options?: { readonly maxBytes?: number; readonly maxEntries?: number },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const maxBytes = Math.min(
      options?.maxBytes ?? MAX_ACQUIRED_TREE_BYTES,
      MAX_ACQUIRED_TREE_BYTES,
    );
    const maxEntries = Math.min(
      options?.maxEntries ?? MAX_ACQUIRED_TREE_ENTRIES,
      MAX_ACQUIRED_TREE_ENTRIES,
    );
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new AcquiredTreeLimitExceeded({ resource: "bytes", limit: maxBytes });
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return yield* new AcquiredTreeLimitExceeded({ resource: "entries", limit: maxEntries });
    }
    const pending = [directory];
    let entries = 0;
    let bytes = 0;

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const info = yield* fs.stat(current);
      if (info.type === "Directory") {
        const children = yield* fs.readDirectory(current);
        entries += children.length;
        if (entries > maxEntries) {
          return yield* new AcquiredTreeLimitExceeded({
            resource: "entries",
            limit: maxEntries,
          });
        }
        for (const name of children) pending.push(path.join(current, name));
      } else {
        bytes += Number(info.size);
        if (bytes > maxBytes) {
          return yield* new AcquiredTreeLimitExceeded({
            resource: "bytes",
            limit: maxBytes,
          });
        }
      }
    }
    return bytes;
  });
