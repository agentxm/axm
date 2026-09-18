import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Terminal from "effect/Terminal";

import type { Doc } from "../doc.js";
import { paintText } from "../paint-text.js";
import type { ScenePart } from "../scene.js";
import type { ChooseAsk, ConfirmAsk, InputAsk } from "./ask.js";
import { runAsk, type AskSurface } from "./run.js";

const gate: ConfirmAsk<"declined" | "approved"> = {
  _tag: "Confirm",
  question: "Apply changes?",
  label: "Apply changes",
  choices: [
    { key: "n", word: "no", value: "declined" },
    { key: "y", word: "yes", value: "approved" },
  ],
};

const press = (name: string, options?: { readonly ctrl?: boolean }): Terminal.UserInput => ({
  input: name.length === 1 && options?.ctrl !== true ? Option.some(name) : Option.none(),
  key: { name, ctrl: options?.ctrl === true, meta: false, shift: false },
});

interface Harness {
  readonly terminal: Terminal.Terminal;
  readonly surface: AskSurface;
  readonly keys: Queue.Queue<Terminal.UserInput, Cause.Done>;
  /** The interaction the scene stands on after each change; `undefined` cleared it. */
  readonly shown: Array<ScenePart | undefined>;
  readonly transcript: Array<Doc>;
}

const makeHarness: Effect.Effect<Harness> = Effect.gen(function* () {
  const keys = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const shown: Array<ScenePart | undefined> = [];
  const transcript: Array<Doc> = [];
  return {
    keys,
    shown,
    transcript,
    terminal: Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.succeed(Queue.asDequeue(keys)),
      readLine: Effect.succeed(""),
      display: () => Effect.void,
    }),
    surface: {
      showInteraction: (part) => Effect.sync(() => void shown.push(part)),
      transcript: (doc) => Effect.sync(() => void transcript.push(doc)),
    },
  };
});

/** The lines the live region last stood on before it was cleared, in `rows` rows. */
const lastFrame = (harness: Harness, rows = 24): ReadonlyArray<string> => {
  const part = harness.shown.filter((entry) => entry !== undefined).at(-1);
  return part === undefined
    ? []
    : paintText(part({ columns: 80, rows, spinner: "", nowMs: 0 }), {
        width: 80,
        colors: false,
      });
};

const source: ChooseAsk<string> = {
  _tag: "Choose",
  question: "Instructions source",
  options: [
    { title: "AGENTS.md", value: "AGENTS.md" },
    { title: "CLAUDE.md", value: "CLAUDE.md" },
    { title: "GEMINI.md", value: "GEMINI.md" },
  ],
};

const fileName: InputAsk<string> = {
  _tag: "Input",
  question: "Instructions file name",
  validate: (raw) => (raw.length === 0 ? Result.fail("Enter a file name.") : Result.succeed(raw)),
};

describe("runAsk", () => {
  it.effect("answers with the choice whose key was pressed", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("y"));

      const answer = yield* runAsk(gate, harness.terminal, harness.surface);

      expect(answer).toBe("approved");
      expect(harness.transcript).toEqual([
        [{ _tag: "answer", mark: "ok", label: "Apply changes", value: "yes" }],
      ]);
      // The question opened, then left, and nothing of it is still standing.
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("repaints the moved question before it is submitted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("right"));
      yield* Queue.offer(harness.keys, press("return"));

      const answer = yield* runAsk(gate, harness.terminal, harness.surface);

      expect(answer).toBe("approved");
      expect(lastFrame(harness).join("")).toContain("n  no    Y  yes");
    }),
  );

  it.effect("cancels on escape without writing an answer", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("escape"));

      const failure = yield* runAsk(gate, harness.terminal, harness.surface).pipe(Effect.flip);

      expect(failure._tag).toBe("PromptCancelled");
      expect(harness.transcript).toEqual([]);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("cancels when the terminal stops sending keys", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.end(harness.keys);

      const failure = yield* runAsk(gate, harness.terminal, harness.surface).pipe(Effect.flip);

      expect(failure._tag).toBe("PromptCancelled");
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("clears the question when the command around it is interrupted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const running = yield* Effect.forkChild(runAsk(gate, harness.terminal, harness.surface));
      // Let the question reach the scene before the command is interrupted.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(running);

      expect(harness.shown.length).toBeGreaterThanOrEqual(2);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("answers a list with the option under the caret", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("down"));
      yield* Queue.offer(harness.keys, press("return"));

      const answer = yield* runAsk(source, harness.terminal, harness.surface);

      expect(answer).toBe("CLAUDE.md");
      expect(harness.transcript).toEqual([
        [{ _tag: "answer", mark: "ok", label: "Instructions source", value: "CLAUDE.md" }],
      ]);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("sizes an open list to the rows the scene gives it on each paint", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("down"));
      yield* Queue.offer(harness.keys, press("return"));

      yield* runAsk(source, harness.terminal, harness.surface);

      expect(lastFrame(harness, 24)).toHaveLength(4);
      expect(lastFrame(harness, 3)).toEqual([
        " ?   Instructions source",
        " ❯   CLAUDE.md",
        " ·   2 more",
      ]);
    }),
  );

  it.effect("keeps a refused line open until a valid one is submitted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("return"));
      yield* Queue.offer(harness.keys, press("a"));
      yield* Queue.offer(harness.keys, press("return"));

      const answer = yield* runAsk(fileName, harness.terminal, harness.surface);

      expect(answer).toBe("a");
      // The refusal was shown before the line was fixed, and left no trace.
      const refused = harness.shown
        .filter((entry) => entry !== undefined)
        .map((part) =>
          paintText(part({ columns: 80, rows: 24, spinner: "", nowMs: 0 }), {
            width: 80,
            colors: false,
          }),
        )
        .some((lines) => lines.includes(" ▲   Enter a file name."));
      expect(refused).toBe(true);
      expect(harness.transcript).toEqual([
        [{ _tag: "answer", mark: "ok", label: "Instructions file name", value: "a" }],
      ]);
    }),
  );

  it.effect("cancels a typed line on escape", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("a"));
      yield* Queue.offer(harness.keys, press("escape"));

      const failure = yield* runAsk(fileName, harness.terminal, harness.surface).pipe(Effect.flip);

      expect(failure._tag).toBe("PromptCancelled");
      expect(harness.transcript).toEqual([]);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );
});
