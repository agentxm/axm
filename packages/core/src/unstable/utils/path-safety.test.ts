import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { isPathSafe, safeChildPath } from "./path-safety.js";
import { decodeAbsolutePathSync } from "./path-types.js";

describe("isPathSafe", () => {
  const check = (base: string, target: string) =>
    Effect.map(Path.Path, (path) => isPathSafe(path, base, target)).pipe(
      Effect.provide(NodeServices.layer),
    );

  it.effect("returns true when target is within base", () =>
    Effect.map(check("/a/b", "/a/b/c/d"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("returns true when target equals base", () =>
    Effect.map(check("/a/b", "/a/b"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("returns false when target escapes via parent traversal", () =>
    Effect.map(check("/a/b", "/a/b/../../etc/passwd"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("returns false when target is a sibling of base", () =>
    Effect.map(check("/a/b", "/a/c"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("normalizes paths with . and .. segments before comparison", () =>
    Effect.map(check("/a/b", "/a/b/./c/../c/d"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("prevents prefix false positive (boundary check)", () =>
    Effect.map(check("/a/base", "/a/base-extended/file"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("returns true for deeply nested target within base", () =>
    Effect.map(check("/a", "/a/b/c/d/e/f"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("returns false when target is parent of base", () =>
    Effect.map(check("/a/b/c", "/a/b"), (safe) => expect(safe).toBe(false)),
  );
});

describe("safeChildPath", () => {
  it.effect("returns a branded absolute path when target stays under base", () =>
    Effect.gen(function* () {
      const result = yield* safeChildPath(decodeAbsolutePathSync("/a/b"), "c").pipe(
        Effect.provide(NodeServices.layer),
      );
      expect(Option.getOrNull(result)).toBe("/a/b/c");
    }),
  );

  it.effect("returns none when target escapes base", () =>
    Effect.gen(function* () {
      const result = yield* safeChildPath(decodeAbsolutePathSync("/a/b"), "/a/c").pipe(
        Effect.provide(NodeServices.layer),
      );
      expect(Option.isNone(result)).toBe(true);
    }),
  );
});
