import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import { Prompt } from "effect/unstable/cli";
import * as Terminal from "effect/Terminal";
import * as Option from "effect/Option";
import { nonInteractiveFlag } from "../../cli-flags/index.js";
import { requireInteractive } from "./helpers.js";

const makeHarness = Effect.gen(function* () {
  const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const layer = Layer.mergeAll(
    FileSystem.layerNoop({}),
    Path.layer,
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        readInput: Effect.succeed(Queue.asDequeue(queue)),
        readLine: Effect.succeed(""),
        display: () => Effect.void,
      }),
    ),
  );

  return { layer, queue };
});

describe("requireInteractive", () => {
  it.effect("runs the prompt when interactive", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      const result = yield* requireInteractive(Prompt.succeed("from-prompt"), {
        message: "Prompt value",
      }).pipe(
        Effect.provide(
          Layer.mergeAll(harness.layer, Layer.succeed(nonInteractiveFlag, Option.some(false))),
        ),
      );

      expect(result).toBe("from-prompt");
    }),
  );

  it.effect("fails with PROMPT_REQUIRED when non-interactive", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      const exit = yield* requireInteractive(Prompt.succeed("from-prompt"), {
        message: "Prompt value",
      }).pipe(
        Effect.flip,
        Effect.provide(
          Layer.mergeAll(harness.layer, Layer.succeed(nonInteractiveFlag, Option.some(true))),
        ),
      );

      expect(exit._tag).toBe("AppError");
      if (exit._tag !== "AppError") {
        throw new Error("Expected AppError");
      }

      expect(exit.code).toBe("PROMPT_REQUIRED");
      expect(exit.message).toContain("Prompt value");
    }),
  );

  it.effect("maps QuitError to PromptCancelled", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.end(harness.queue);

      const exit = yield* requireInteractive(Prompt.text({ message: "Pet name:" }), {
        message: "Pet name:",
      }).pipe(
        Effect.flip,
        Effect.provide(
          Layer.mergeAll(harness.layer, Layer.succeed(nonInteractiveFlag, Option.some(false))),
        ),
      );

      expect(exit._tag).toBe("PromptCancelled");
      expect(exit.message).toBe("Operation cancelled.");
    }),
  );
});
