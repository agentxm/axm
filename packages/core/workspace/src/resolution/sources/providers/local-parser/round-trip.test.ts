import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { printLocalSource } from "@agentxm/extension-model/unstable/sources/forge-grammar";
import { parseLocalPath } from "./parser.js";

describe("print round-trip", () => {
  it.effect("relative path", () =>
    Effect.gen(function* () {
      const path = "./my/skills";
      const source = yield* parseLocalPath(path);
      expect(printLocalSource(source)).toBe(path);
    }),
  );

  it.effect("absolute path", () =>
    Effect.gen(function* () {
      const path = "/home/user/skills";
      const source = yield* parseLocalPath(path);
      expect(printLocalSource(source)).toBe(path);
    }),
  );
});
