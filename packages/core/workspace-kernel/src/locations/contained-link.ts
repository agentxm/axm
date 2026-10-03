import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { NativeLocationError, resolveNativeReferent } from "./native-address.js";

/** A payload link must remain inside its package after that package is relocated. */
export const validateContainedLink = (root: string, entry: string, target: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const escaped = () =>
      new NativeLocationError({
        target: entry,
        reason: "escape",
        cause: "non-relocatable-payload-link",
      });
    if (path.isAbsolute(target)) return yield* escaped();
    const resolvedRoot = yield* resolveNativeReferent(root);
    let current = yield* resolveNativeReferent(path.dirname(entry));
    const isContained = (candidate: string) => {
      const relative = path.relative(resolvedRoot, candidate);
      return (
        !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
      );
    };
    if (!isContained(current)) return yield* escaped();
    const segments = (value: string) => value.split(path.sep === "\\" ? /[\\/]/ : "/");
    const pending: Array<string | { readonly leave: string }> = segments(target).reverse();
    const active = new Set<string>();
    let remainingSteps = 1_000_000;
    while (pending.length > 0) {
      if (--remainingSteps < 0)
        return yield* new NativeLocationError({
          target: entry,
          reason: "unreadable",
          cause: "payload-link-resolution-limit",
        });
      const part = pending.pop();
      if (part === undefined) break;
      if (typeof part !== "string") {
        active.delete(part.leave);
        continue;
      }
      if (part === "" || part === ".") continue;
      const next = path.resolve(current, part);
      if (!isContained(next)) return yield* escaped();
      const nested = yield* fs.readLink(next).pipe(
        Effect.map(Option.some),
        Effect.catchIf(
          (error) => {
            const cause = error.reason.cause;
            return (
              error.reason._tag === "NotFound" ||
              (typeof cause === "object" &&
                cause !== null &&
                "code" in cause &&
                (cause.code === "EINVAL" || cause.code === "ENOTDIR"))
            );
          },
          () => Effect.succeed(Option.none<string>()),
        ),
        Effect.mapError(
          (cause) => new NativeLocationError({ target: entry, reason: "unreadable", cause }),
        ),
      );
      if (Option.isNone(nested)) {
        current = next;
        continue;
      }
      if (path.isAbsolute(nested.value)) return yield* escaped();
      // Cycles are payload, not traversable locations. Never stat their referents.
      if (active.has(next)) return;
      active.add(next);
      current = path.dirname(next);
      pending.push({ leave: next });
      for (const segment of segments(nested.value).reverse()) pending.push(segment);
    }
  });
