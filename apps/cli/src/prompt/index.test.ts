import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";

import { AxmPrompt } from "./index.js";

const makeUserInput = (key: string): Terminal.UserInput => ({
  input: Option.some(key),
  key: { name: key, ctrl: false, meta: false, shift: false },
});

const makeHarness = Effect.gen(function* () {
  const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const terminal = Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    display: () => Effect.void,
    readInput: Effect.succeed(Queue.asDequeue(queue)),
    readLine: Effect.succeed(""),
  });

  return {
    queue,
    layer: Layer.mergeAll(
      FileSystem.layerNoop({}),
      Path.layer,
      Layer.succeed(Terminal.Terminal, terminal),
    ),
  };
});

describe("AxmPrompt composability", () => {
  it.effect("works inside Prompt.all", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("a"));

      const result = yield* Prompt.all({
        action: AxmPrompt.selectKey({
          message: "Quick action",
          choices: [{ key: "a", title: "Adopt", value: "adopt" }],
        }),
        status: Prompt.succeed("ready"),
      }).pipe(Prompt.run, Effect.provide(harness.layer));

      expect(result).toEqual({
        action: "adopt",
        status: "ready",
      });
    }),
  );

  it.effect("works with Prompt.flatMap", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("i"));

      const result = yield* AxmPrompt.selectKey({
        message: "Quick action",
        choices: [{ key: "i", title: "Intake", value: "intake" }],
      }).pipe(
        Prompt.flatMap((action) => Prompt.succeed(`selected:${action}`)),
        Prompt.run,
        Effect.provide(harness.layer),
      );

      expect(result).toBe("selected:intake");
    }),
  );

  it.effect("works with yield*", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("l"));

      const result = yield* AxmPrompt.selectKey({
        message: "Quick action",
        choices: [{ key: "l", title: "List", value: "list" }],
      }).pipe(Effect.provide(harness.layer));

      expect(result).toBe("list");
    }),
  );
});
