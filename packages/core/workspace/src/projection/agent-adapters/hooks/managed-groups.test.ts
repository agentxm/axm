import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";

import { updateHooksJson } from "./managed-groups.js";

describe("updateHooksJson", () => {
  it.effect("reports malformed JSONC as a validation failure", () =>
    Effect.gen(function* () {
      const error = yield* updateHooksJson("settings.json", "hooks", "{ invalid", {}).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe("HookConfigInvalid");
    }),
  );

  fastCheckIt.prop(
    {
      command: FastCheck.string({ minLength: 1, maxLength: 100 }),
      matcher: FastCheck.option(FastCheck.string({ maxLength: 40 }), { nil: undefined }),
    },
    { numRuns: 100, seed: 0x41584d },
  )("is idempotent for rendered commands regardless of command path", ({ command, matcher }) =>
    // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
    Effect.runPromise(
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
    ),
  );
});
