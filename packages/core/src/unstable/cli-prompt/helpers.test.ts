import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { PromptCancelled } from "./prompt-cancelled.js";
import { autoConfirm, fromFlagOrPrompt } from "./helpers.js";

describe("fromFlagOrPrompt", () => {
  it.effect("returns the flag value when Option is Some", () =>
    Effect.gen(function* () {
      const result = yield* fromFlagOrPrompt(Option.some("from-flag"), () =>
        Effect.succeed("from-prompt"),
      );
      expect(result).toBe("from-flag");
    }),
  );

  it.effect("calls the prompt when Option is None", () =>
    Effect.gen(function* () {
      const result = yield* fromFlagOrPrompt(Option.none(), () => Effect.succeed("from-prompt"));
      expect(result).toBe("from-prompt");
    }),
  );

  it.effect("propagates PromptCancelled from the prompt", () =>
    Effect.gen(function* () {
      const exit = yield* fromFlagOrPrompt(Option.none(), () =>
        Effect.fail(new PromptCancelled({ message: "cancelled" })),
      ).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("does not call the prompt when Option is Some", () =>
    Effect.gen(function* () {
      let called = false;
      yield* fromFlagOrPrompt(Option.some("value"), () => {
        called = true;
        return Effect.succeed("should not run");
      });
      expect(called).toBe(false);
    }),
  );

  it.effect("works with non-string types", () =>
    Effect.gen(function* () {
      const result = yield* fromFlagOrPrompt(Option.some(42), () => Effect.succeed(99));
      expect(result).toBe(42);
    }),
  );
});

describe("autoConfirm", () => {
  it.effect("returns true when yes is true", () =>
    Effect.gen(function* () {
      const result = yield* autoConfirm(true, () => Effect.succeed(false));
      expect(result).toBe(true);
    }),
  );

  it.effect("does not call the prompt when yes is true", () =>
    Effect.gen(function* () {
      let called = false;
      yield* autoConfirm(true, () => {
        called = true;
        return Effect.succeed(false);
      });
      expect(called).toBe(false);
    }),
  );

  it.effect("calls the prompt when yes is false", () =>
    Effect.gen(function* () {
      const result = yield* autoConfirm(false, () => Effect.succeed(true));
      expect(result).toBe(true);
    }),
  );

  it.effect("returns false from prompt when user declines", () =>
    Effect.gen(function* () {
      const result = yield* autoConfirm(false, () => Effect.succeed(false));
      expect(result).toBe(false);
    }),
  );

  it.effect("propagates PromptCancelled from the prompt", () =>
    Effect.gen(function* () {
      const exit = yield* autoConfirm(false, () =>
        Effect.fail(new PromptCancelled({ message: "cancelled" })),
      ).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }),
  );
});
