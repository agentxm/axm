import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";
import { TestConsole } from "effect/testing";
import { Prompt } from "effect/unstable/cli";
import { autocompleteMultiselect } from "./autocomplete-multiselect.js";

interface TestTerminal extends Terminal.Terminal {
  readonly inputKey: (
    key: string,
    modifiers?: Partial<{ readonly ctrl: boolean }>,
  ) => Effect.Effect<void>;
  readonly inputText: (text: string) => Effect.Effect<void>;
}

const toUserInput = (
  key: string,
  modifiers: Partial<{ readonly ctrl: boolean }> = {},
): Terminal.UserInput => ({
  input: Option.some(key),
  key: {
    name: key,
    ctrl: modifiers.ctrl ?? false,
    meta: false,
    shift: false,
  },
});

const makeTerminal = Effect.gen(function* () {
  const queue = yield* Queue.make<Terminal.UserInput, never>();
  const inputText = (text: string) =>
    Queue.offerAll(
      queue,
      Array.from(text, (key) => toUserInput(key)),
    ).pipe(Effect.asVoid);
  const inputKey = (key: string, modifiers?: Partial<{ readonly ctrl: boolean }>) =>
    Queue.offer(queue, toUserInput(key, modifiers)).pipe(Effect.asVoid);

  const terminal: TestTerminal = Object.assign(
    Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      display: Console.log,
      readInput: Effect.succeed(Queue.asDequeue(queue)),
      readLine: Effect.succeed(""),
    }),
    {
      inputKey,
      inputText,
    },
  );

  return terminal;
});

const ansiPattern = new RegExp(String.raw`\u001B\[[0-9;]*[A-Za-z]`, "g");

const stripAnsi = (text: string) => text.replace(ansiPattern, "");

const toConsoleLines = (output: ReadonlyArray<unknown>): Array<string> =>
  output.map((line) => String(line));

const testLayer = (terminal: TestTerminal) =>
  Layer.mergeAll(
    TestConsole.layer,
    FileSystem.layerNoop({}),
    Path.layer,
    Layer.succeed(Terminal.Terminal, terminal),
  );

describe("autocompleteMultiselect", () => {
  it.effect("filters choices while typing and selects the visible match", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
          { title: "Cherry", value: "cherry" },
        ],
      });

      yield* terminal.inputText("ban");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));
      expect(result).toEqual(["banana"]);

      const output = toConsoleLines(yield* TestConsole.logLines);
      const filteredFrame = output.map(stripAnsi).find((line) => line.includes("filter: ban"));
      expect(filteredFrame).toContain("Banana");
      expect(filteredFrame).not.toContain("Apple");
    }),
  );

  it.effect("keeps selections when the filter changes", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
          { title: "Cherry", value: "cherry" },
        ],
      });

      yield* terminal.inputKey("space");
      yield* terminal.inputText("ban");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("u", { ctrl: true });
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));
      expect(result).toEqual(["apple", "banana"]);
    }),
  );

  it.effect("shows the empty message when no choices match", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        emptyMessage: "No pets match",
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
        ],
      });

      yield* terminal.inputText("zzz");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));
      expect(result).toEqual([]);

      const output = toConsoleLines(yield* TestConsole.logLines);
      const text = stripAnsi(output.join("\n"));
      expect(text).toContain("No pets match");
    }),
  );

  it.effect("limits the rendered choices with maxPerPage", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        maxPerPage: 2,
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
          { title: "Cherry", value: "cherry" },
          { title: "Date", value: "date" },
        ],
      });

      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));
      expect(result).toEqual([]);

      const output = toConsoleLines(yield* TestConsole.logLines);
      const firstFrame = stripAnsi(output.find((line) => line.includes("Pick pets")) ?? "");
      expect(firstFrame).toContain("Apple");
      expect(firstFrame).toContain("Banana");
      expect(firstFrame).not.toContain("Cherry");
      expect(firstFrame).toContain("...");
    }),
  );

  it.effect("replaces the active prompt with a separated summary on submit", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        submissionMessage: (selected) => `Selected ${selected.length} pets`,
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
        ],
      });

      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));
      expect(result).toEqual([]);

      const frames = toConsoleLines(yield* TestConsole.logLines).map(stripAnsi);
      const activeFrame = frames.find((line) => line.includes("Pick pets")) ?? "";
      expect(activeFrame).toContain("space toggle");
      expect(activeFrame).toContain("enter confirm");

      const submittedFrame = frames.find((line) => line.includes("Selected 0 pets")) ?? "";
      expect(submittedFrame).toBe("✓ Selected 0 pets\n\n");
      expect(submittedFrame).not.toContain("Pick pets");
      expect(submittedFrame).not.toContain("space toggle");
    }),
  );

  it.effect("renders a custom hint when provided", () =>
    Effect.gen(function* () {
      const terminal = yield* makeTerminal;
      const prompt = autocompleteMultiselect({
        message: "Pick pets",
        hint: "press space then enter",
        choices: [{ title: "Apple", value: "apple" }],
      });

      yield* terminal.inputKey("enter");

      yield* Prompt.run(prompt).pipe(Effect.provide(testLayer(terminal)));

      const frames = toConsoleLines(yield* TestConsole.logLines).map(stripAnsi);
      const activeFrame = frames.find((line) => line.includes("Pick pets")) ?? "";
      expect(activeFrame).toContain("press space then enter");
    }),
  );
});
