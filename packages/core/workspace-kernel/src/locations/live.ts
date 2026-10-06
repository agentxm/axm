// Host adapter: Effect's realPath retains caller spelling. These OS interfaces
// return the spelling of resolved directory entries without enumerating ancestors.
import { open, readlink, realpath, stat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { CanonicalNativePath, NativeLocationError } from "./native-address.js";

// Node omits O_PATH from fs.constants. Linux's x64/arm64 UAPI defines 010000000:
// https://github.com/torvalds/linux/blob/v6.12/include/uapi/asm-generic/fcntl.h
// O_PATH follows links without reading the file or blocking on a FIFO/device.
const LINUX_O_PATH = 0o10000000;
const linuxCanonicalPath = (target: string) => {
  const failure = (cause: unknown) =>
    new NativeLocationError({ target, reason: "unreadable", cause });
  return Effect.acquireUseRelease(
    Effect.tryPromise({ try: () => open(target, LINUX_O_PATH), catch: failure }),
    (handle) =>
      Effect.gen(function* () {
        // proc_pid_fd(5) exposes the VFS dentry path, including casefolded names.
        const resolved = yield* Effect.tryPromise({
          try: () => readlink(`/proc/self/fd/${handle.fd}`),
          catch: failure,
        }).pipe(Effect.result);
        if (Result.isFailure(resolved)) {
          const cause = resolved.failure.cause;
          // Restricted/chrooted Linux can lack procfs. No spelling was observed;
          // resolution then uses the selected filesystem's listing walk.
          if (
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            (cause.code === "ENOENT" ||
              cause.code === "ENOTDIR" ||
              cause.code === "EACCES" ||
              cause.code === "EPERM" ||
              cause.code === "ENOSYS")
          )
            return undefined;
          return yield* resolved.failure;
        }
        const canonical = resolved.success;
        const opened = yield* Effect.tryPromise({
          try: () => handle.stat({ bigint: true }),
          catch: failure,
        });
        const named = yield* Effect.tryPromise({
          try: () => stat(canonical, { bigint: true }),
          catch: failure,
        });
        // Refuse a removed/replaced path (including procfs's deleted-path annotation).
        if (
          opened.dev !== named.dev ||
          opened.ino !== named.ino ||
          opened.mode !== named.mode ||
          opened.birthtimeNs !== named.birthtimeNs
        )
          return yield* failure("canonical-path-changed");
        return canonical;
      }),
    (handle) => Effect.tryPromise({ try: () => handle.close(), catch: failure }),
  );
};

export const CanonicalNativePathLive = Layer.succeed(
  CanonicalNativePath,
  process.platform === "darwin"
    ? (target: string) =>
        Effect.tryPromise({
          try: () => realpath(target),
          catch: (cause) => new NativeLocationError({ target, reason: "unreadable", cause }),
        })
    : process.platform === "linux"
      ? linuxCanonicalPath
      : undefined,
);
