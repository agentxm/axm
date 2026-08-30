import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";

import { updateHooksJson } from "./managed-groups.js";

describe("updateHooksJson", () => {
  it.effect("reports malformed JSONC as a validation failure", () =>
    Effect.gen(function* () {
      const error = yield* updateHooksJson("settings.json", "hooks", "{ invalid", {}).pipe(
        Effect.flip,
      );

      expect(error.code).toBe("validation");
    }),
  );

  it.effect.prop(
    "is idempotent for rendered commands regardless of command path",
    {
      command: FastCheck.string({ minLength: 1, maxLength: 100 }),
      matcher: FastCheck.option(FastCheck.string({ maxLength: 40 }), { nil: undefined }),
    },
    ({ command, matcher }) =>
      Effect.gen(function* () {
        const group = {
          ...(matcher === undefined ? {} : { matcher }),
          hooks: [{ type: "command", command }],
        };
        const rendered = { PreToolUse: [group] };
        const once = yield* updateHooksJson("settings.json", "hooks", "{}\n", rendered);
        const twice = yield* updateHooksJson("settings.json", "hooks", once, rendered);
        expect(twice).toBe(once);
      }),
    { fastCheck: { numRuns: 100, seed: 0x41584d } },
  );
});
