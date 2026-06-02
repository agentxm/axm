import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseShorthand } from "./shorthand.js";

describe("gitlab shorthand", () => {
  it.effect("parses subgroup namespace with // subpath and ref", () =>
    Effect.gen(function* () {
      const result = yield* parseShorthand("gitlab:group/subgroup/widgets//packages/tool@v2");

      expect(result.type).toBe("gitlab");
      expect(result.owner).toBe("group/subgroup");
      expect(result.repo).toBe("widgets");
      expect(Option.getOrNull(result.subPath)).toBe("packages/tool");
      expect(Option.getOrNull(result.ref)).toBe("v2");
    }),
  );
});
