import { isNotFound } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

/** Effect preserves native inode precision through its bigint filesystem contract. */
export const nativeInode = (info: FileSystem.File.Info) =>
  info.ino.pipe(
    Option.filter((inode) => inode > 0n),
    Option.map(String),
  );

/** Identity of the link itself, including dangling links; never its referent. */
export const nativeLinkIdentity = Effect.fnUntraced(function* (target: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.lstat(target).pipe(
    Effect.map((info) =>
      info.type === "SymbolicLink"
        ? Option.all({ inode: nativeInode(info), birthtime: info.birthtime }).pipe(
            Option.filter(({ birthtime }) => birthtime.getTime() > 0),
            Option.map(({ inode, birthtime }) => ({
              device: info.dev.toString(),
              inode,
              birthtime: birthtime.getTime(),
            })),
          )
        : Option.none(),
    ),
    Effect.catchIf(isNotFound, () => Effect.succeedNone),
  );
});
