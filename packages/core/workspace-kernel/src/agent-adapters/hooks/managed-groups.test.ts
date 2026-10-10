import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";

import { updateHooksJson } from "./managed-groups.js";

describe("updateHooksJson", () => {
  it.effect.each([" && echo other", "\n echo other", ' "$(echo other)"', " `echo other`"])(
    "refuses shell composition on selected native scripts: %s",
    (suffix) =>
      Effect.gen(function* () {
        const declaration = {
          name: "audit",
          ref: "@test/hooks/audit",
          scope: "project" as const,
          root: "/hooks/audit",
        };
        const raw = JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: `node /hooks/audit/run.js${suffix}` }] }],
          },
        });
        expect(
          (yield* updateHooksJson("settings.json", "hooks", raw, {}, [declaration]).pipe(
            Effect.result,
          ))._tag,
        ).toBe("Failure");
      }),
  );
  it.effect("reports malformed JSONC as a validation failure", () =>
    Effect.gen(function* () {
      const error = yield* updateHooksJson("settings.json", "hooks", "{ invalid", {}, []).pipe(
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
  )(
    "is idempotent for declared registrations with arbitrary literal arguments",
    ({ command, matcher }) =>
      // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
      Effect.runPromise(
        Effect.gen(function* () {
          const group = {
            ...(matcher === undefined ? {} : { matcher }),
            hooks: [
              {
                type: "command",
                command: `node /hooks/property/handler.js '${command.replaceAll("'", `'"'"'`)}'`,
              },
            ],
          };
          const rendered = { PreToolUse: [group] };
          const once = yield* updateHooksJson("settings.json", "hooks", "{}\n", rendered, [
            {
              name: "property",
              ref: "@test/hooks/property",
              scope: "project",
              root: "/hooks/property",
            },
          ]);
          const twice = yield* updateHooksJson("settings.json", "hooks", once, rendered, [
            {
              name: "property",
              ref: "@test/hooks/property",
              scope: "project",
              root: "/hooks/property",
            },
          ]);
          expect(twice).toBe(once);
        }),
      ),
  );
});
