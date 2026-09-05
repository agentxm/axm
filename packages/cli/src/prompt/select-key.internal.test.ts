import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";
import * as Cli from "effect/unstable/cli";
import { selectKey } from "./select-key.js";

const { Prompt } = Cli;

interface PromptHarness {
  readonly layer: Layer.Layer<Terminal.Terminal | FileSystem.FileSystem | Path.Path>;
  readonly queue: Queue.Queue<Terminal.UserInput, Cause.Done>;
  readonly output: Array<string>;
}

const makeUserInput = (
  key: string,
  options?: {
    readonly input?: string;
    readonly shift?: boolean;
  },
): Terminal.UserInput => ({
  input: Option.some(options?.input ?? key),
  key: { name: key, ctrl: false, meta: false, shift: options?.shift ?? false },
});

const makeHarness = Effect.gen(function* () {
  const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const output: Array<string> = [];
  const terminal = Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.succeed(Queue.asDequeue(queue)),
    readLine: Effect.succeed(""),
    display: (text) => {
      output.push(text);
      return Effect.void;
    },
  });

  const layer = Layer.mergeAll(
    FileSystem.layerNoop({}),
    Path.layer,
    Layer.succeed(Terminal.Terminal, terminal),
  );

  return { layer, queue, output };
});

const runPrompt = (prompt: ReturnType<typeof selectKey>, harness: PromptHarness) =>
  Prompt.run(prompt).pipe(Effect.provide(harness.layer));

describe("selectKey", () => {
  it.effect("submits the matching key", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("y"));

      const result = yield* runPrompt(
        selectKey({
          message: "Choose an action:",
          choices: [
            { key: "y", title: "Yes", value: "yes" },
            { key: "n", title: "No", value: "no" },
          ],
        }),
        harness,
      );

      expect(result).toBe("yes");
    }),
  );

  it.effect("shows an error for a non-matching key and keeps waiting", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("x"));
      yield* Queue.offer(harness.queue, makeUserInput("n"));

      const result = yield* runPrompt(
        selectKey({
          message: "Choose an action:",
          choices: [
            { key: "y", title: "Yes", value: "yes" },
            { key: "n", title: "No", value: "no" },
          ],
        }),
        harness,
      );

      expect(result).toBe("no");
      expect(harness.output.join("\n")).toContain("Invalid key");
    }),
  );

  it.effect("matches case-insensitively by default", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("Y"));

      const result = yield* runPrompt(
        selectKey({
          message: "Choose an action:",
          choices: [{ key: "y", title: "Yes", value: "yes" }],
        }),
        harness,
      );

      expect(result).toBe("yes");
    }),
  );

  it.effect("respects caseSensitive: true", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.queue, makeUserInput("Y"));
      yield* Queue.offer(harness.queue, makeUserInput("y"));

      const result = yield* runPrompt(
        selectKey({
          message: "Choose an action:",
          caseSensitive: true,
          choices: [{ key: "y", title: "Yes", value: "yes" }],
        }),
        harness,
      );

      expect(result).toBe("yes");
      expect(harness.output.join("\n")).toContain("Invalid key");
    }),
  );

  it.effect("uses the typed character when case-sensitive terminals lowercase key.name", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(
        harness.queue,
        makeUserInput("y", {
          input: "Y",
          shift: true,
        }),
      );

      const result = yield* runPrompt(
        selectKey({
          message: "Choose an action:",
          caseSensitive: true,
          choices: [{ key: "Y", title: "Yes", value: "yes" }],
        }),
        harness,
      );

      expect(result).toBe("yes");
    }),
  );
});
