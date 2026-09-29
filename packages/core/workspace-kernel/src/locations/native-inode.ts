import { stat } from "node:fs/promises";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

/** Effect omits inode numbers outside JavaScript's safe integer range. */
export const nativeInode = (target: string, info: FileSystem.File.Info) =>
  Effect.gen(function* () {
    if (Option.isSome(info.ino) && info.ino.value > 0)
      return Option.some(info.ino.value.toString());
    const raw = yield* Effect.tryPromise({
      try: () => stat(target, { bigint: true }),
      catch: () => undefined,
    }).pipe(Effect.option);
    if (Option.isNone(raw) || Option.isNone(info.birthtime)) return Option.none<string>();
    const observed = raw.value;
    if (
      observed.ino <= 0n ||
      observed.dev !== BigInt(info.dev) ||
      observed.mode !== BigInt(info.mode) ||
      observed.birthtime.getTime() !== info.birthtime.value.getTime() ||
      (info.type === "File" && !observed.isFile()) ||
      (info.type === "Directory" && !observed.isDirectory())
    )
      return Option.none<string>();
    return Option.some(observed.ino.toString());
  });
