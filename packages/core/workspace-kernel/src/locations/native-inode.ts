import { lstat } from "node:fs/promises";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

/** Effect preserves native inode precision through its bigint filesystem contract. */
export const nativeInode = (info: FileSystem.File.Info) =>
  Effect.succeed(
    info.ino.pipe(
      Option.filter((inode) => inode > 0n),
      Option.map(String),
    ),
  );

/** Identity of the link itself, including dangling links; never its referent. */
export const nativeLinkIdentity = (target: string) =>
  Effect.tryPromise({
    try: () => lstat(target, { bigint: true }),
    catch: () => undefined,
  }).pipe(
    Effect.option,
    Effect.map(
      Option.flatMap((info) =>
        info.isSymbolicLink() && info.ino > 0n && info.birthtime.getTime() > 0
          ? Option.some({
              device: info.dev.toString(),
              inode: info.ino.toString(),
              birthtime: info.birthtime.getTime(),
            })
          : Option.none(),
      ),
    ),
  );
