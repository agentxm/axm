import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";

/** Native removal semantics that FileSystem.remove cannot express safely. */
export class NativeEntryRemoval extends Context.Service<
  NativeEntryRemoval,
  {
    /** Remove the entry itself, including a directory link, without visiting its referent. */
    readonly unlink: (target: string) => Effect.Effect<void, PlatformError.PlatformError>;
    /** Atomically refuse removal if the directory contains any child. */
    readonly removeEmptyDirectory: (
      target: string,
    ) => Effect.Effect<void, PlatformError.PlatformError>;
  }
>()("@agentxm/workspace-kernel/locations/NativeEntryRemoval") {}
