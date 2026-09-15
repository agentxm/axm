import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { safeChildPath } from "./path-safety.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

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
