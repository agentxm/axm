import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import { Prompt } from "effect/unstable/cli";
import * as Terminal from "effect/Terminal";
import { autoConfirm, unless } from "./helpers.js";

const PromptLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(80),
      readInput: Queue.unbounded<Terminal.UserInput>().pipe(Effect.map(Queue.asDequeue)),
      readLine: Effect.fail(new Terminal.QuitError({})),
      display: () => Effect.void,
    }),
  ),
);

describe("unless", () => {
  it.effect("returns the flag value when Option is Some", () =>
    Effect.gen(function* () {
      let called = false;
      const prompt = Prompt.succeed("from-prompt").pipe(
        Prompt.map(() => {
          called = true;
          return "from-prompt";
        }),
      );

      const result = yield* unless(prompt, Option.some("from-flag"));

      expect(result).toBe("from-flag");
      expect(called).toBe(false);
    }).pipe(Effect.provide(PromptLayer)),
  );

  it.effect("runs the prompt when Option is None", () =>
    Effect.gen(function* () {
      let called = false;
      const prompt = Prompt.succeed("from-prompt").pipe(
        Prompt.map(() => {
          called = true;
          return "from-prompt";
        }),
      );

      const result = yield* unless(prompt, Option.none());

      expect(result).toBe("from-prompt");
      expect(called).toBe(true);
    }).pipe(Effect.provide(PromptLayer)),
  );

  it.effect("pipe style matches direct call", () =>
    Effect.gen(function* () {
      const direct = yield* unless(Prompt.succeed("value"), Option.none());
      const piped = yield* Prompt.succeed("value").pipe(unless(Option.none()));

      expect(piped).toBe(direct);
    }).pipe(Effect.provide(PromptLayer)),
  );
});

describe("autoConfirm", () => {
  it.effect("returns true immediately when yes is true", () =>
    Effect.gen(function* () {
      let called = false;
      const prompt = Prompt.succeed(false).pipe(
        Prompt.map(() => {
          called = true;
          return false;
        }),
      );

      const result = yield* autoConfirm(prompt, true);

      expect(result).toBe(true);
      expect(called).toBe(false);
    }).pipe(Effect.provide(PromptLayer)),
  );

  it.effect("runs the prompt when yes is false", () =>
    Effect.gen(function* () {
      let called = false;
      const prompt = Prompt.succeed(true).pipe(
        Prompt.map(() => {
          called = true;
          return true;
        }),
      );

      const result = yield* autoConfirm(prompt, false);

      expect(result).toBe(true);
      expect(called).toBe(true);
    }).pipe(Effect.provide(PromptLayer)),
  );

  it.effect("pipe style matches direct call", () =>
    Effect.gen(function* () {
      const direct = yield* autoConfirm(Prompt.succeed(true), false);
      const piped = yield* Prompt.succeed(true).pipe(autoConfirm(false));

      expect(piped).toBe(direct);
    }).pipe(Effect.provide(PromptLayer)),
  );
});
