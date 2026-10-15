import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { contextFor, validSettings } from "./conformance/test-helpers.js";
import { lockfileValidRule } from "./lockfile-valid.js";

describe("workspace/lockfile-valid", () => {
  it.effect("names the versions of a lockfile this AXM does not support", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({
        settings: validSettings(),
        lockfile: { _tag: "valid", contents: "version = 2\n" },
      });

      expect(yield* lockfileValidRule.check(context)).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/lockfile-valid",
          severity: "error",
          message:
            "The accepted external-resolution lockfile uses version 2, but this AXM supports version 1.",
          location: { file: "axm.lock" },
        },
      ]);
    }),
  );
});
