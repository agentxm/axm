import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import { groupMultiselect } from "./group-multiselect.js";

interface PromptTestTerminal extends Terminal.Terminal {
  readonly inputText: (text: string) => Effect.Effect<void>;
  readonly inputKey: (
    key: string,
    modifiers?: Partial<{
      readonly ctrl: boolean;
      readonly meta: boolean;
      readonly shift: boolean;
    }>,
  ) => Effect.Effect<void>;
}

const PromptTestTerminal = ServiceMap.Service<Terminal.Terminal, PromptTestTerminal>()(
  Terminal.Terminal.key,
);

const makeHarness = () => {
  const output: Array<string> = [];

  const make = Effect.gen(function* () {
    const queue = yield* Effect.acquireRelease(
      Queue.make<Terminal.UserInput, Cause.Done>(),
      (queue) => Queue.shutdown(queue),
    );

    const toUserInput = (
      key: string,
      modifiers: Partial<{
        readonly ctrl: boolean;
        readonly meta: boolean;
        readonly shift: boolean;
      }> = {},
    ): Terminal.UserInput => {
      const { ctrl = false, meta = false, shift = false } = modifiers;
      return {
        input: Option.some(key),
        key: { name: key, ctrl, meta, shift },
      };
    };

    const shouldQuit = (input: Terminal.UserInput) =>
      input.key.ctrl && (input.key.name === "c" || input.key.name === "d");

    const inputText = (text: string) => {
      const inputs = Array.from(text, (key) => toUserInput(key));
      return Queue.offerAll(queue, inputs).pipe(Effect.asVoid);
    };

    const inputKey = (
      key: string,
      modifiers: Partial<{
        readonly ctrl: boolean;
        readonly meta: boolean;
        readonly shift: boolean;
      }> = {},
    ) => {
      const input = toUserInput(key, modifiers);
      return shouldQuit(input) ? Queue.end(queue) : Queue.offer(queue, input).pipe(Effect.asVoid);
    };

    const terminal = Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      display: (text) =>
        Effect.sync(() => {
          output.push(text);
        }),
      readInput: Effect.succeed(Queue.asDequeue(queue)),
      readLine: Effect.succeed(""),
    });

    return Object.assign(terminal, {
      inputKey,
      inputText,
    });
  });

  return {
    layer: Layer.effect(PromptTestTerminal, make),
    output,
  };
};

const escape = String.fromCharCode(27);
const bell = String.fromCharCode(7);

const stripAnsi = (text: string) => {
  let result = "";
  let skipping = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === undefined) {
      continue;
    }
    if (skipping) {
      if ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z")) {
        skipping = false;
      }
      continue;
    }
    if (char === escape) {
      skipping = true;
      continue;
    }
    result += char;
  }
  return result;
};

const toFrames = (lines: ReadonlyArray<string>) =>
  lines
    .map((line) => stripAnsi(line))
    .filter((line) => line.split(bell).join("").trim().length > 0);

const findFrame = (frames: ReadonlyArray<string>, text: string) =>
  frames.find((frame) => frame.includes(text));

describe("groupMultiselect", () => {
  it.effect("toggles individual choices and submits selected values", () => {
    const harness = makeHarness();
    const prompt = groupMultiselect({
      message: "Choose services",
      groups: [
        {
          label: "Medical",
          choices: [
            { title: "Vaccination", value: "vaccination" },
            { title: "Microchip", value: "microchip" },
          ],
        },
        {
          label: "Training",
          choices: [{ title: "Obedience", value: "obedience" }],
        },
      ],
    });

    return Effect.gen(function* () {
      const terminal = yield* PromptTestTerminal;
      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepEqual(result, ["microchip"]);

      const frames = toFrames(harness.output);
      assert.isTrue(findFrame(frames, "Choose services") !== undefined);
    }).pipe(Effect.provide(Layer.mergeAll(harness.layer, FileSystem.layerNoop({}), Path.layer)));
  });

  it.effect("selectable header toggles all children", () => {
    const harness = makeHarness();
    const prompt = groupMultiselect({
      message: "Choose services",
      groups: [
        {
          label: "Medical",
          selectableHeader: true,
          choices: [
            { title: "Vaccination", value: "vaccination" },
            { title: "Microchip", value: "microchip" },
          ],
        },
      ],
    });

    return Effect.gen(function* () {
      const terminal = yield* PromptTestTerminal;
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepEqual(result, ["vaccination", "microchip"]);
    }).pipe(Effect.provide(Layer.mergeAll(harness.layer, FileSystem.layerNoop({}), Path.layer)));
  });

  it.effect("shows min validation errors on submit", () => {
    const harness = makeHarness();
    const prompt = groupMultiselect({
      message: "Choose services",
      min: 2,
      groups: [
        {
          label: "Medical",
          selectableHeader: true,
          choices: [
            { title: "Vaccination", value: "vaccination" },
            { title: "Microchip", value: "microchip" },
          ],
        },
      ],
    });

    return Effect.gen(function* () {
      const terminal = yield* PromptTestTerminal;
      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepEqual(result, ["vaccination", "microchip"]);

      const frames = toFrames(harness.output);
      assert.isTrue(findFrame(frames, "At least 2 choices are required") !== undefined);
    }).pipe(Effect.provide(Layer.mergeAll(harness.layer, FileSystem.layerNoop({}), Path.layer)));
  });

  it.effect("shows max validation errors when selecting too many choices", () => {
    const harness = makeHarness();
    const prompt = groupMultiselect({
      message: "Choose services",
      max: 1,
      groups: [
        {
          label: "Medical",
          choices: [
            { title: "Vaccination", value: "vaccination" },
            { title: "Microchip", value: "microchip" },
          ],
        },
      ],
    });

    return Effect.gen(function* () {
      const terminal = yield* PromptTestTerminal;
      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("down");
      yield* terminal.inputKey("space");
      yield* terminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepEqual(result, ["vaccination"]);

      const frames = toFrames(harness.output);
      assert.isTrue(findFrame(frames, "At most 1 choices are allowed") !== undefined);
    }).pipe(Effect.provide(Layer.mergeAll(harness.layer, FileSystem.layerNoop({}), Path.layer)));
  });

  it.effect(
    "blocks selectable header toggles that would exceed max with partially selected children",
    () => {
      const harness = makeHarness();
      const prompt = groupMultiselect({
        message: "Choose services",
        max: 1,
        groups: [
          {
            label: "Medical",
            selectableHeader: true,
            choices: [
              { title: "Vaccination", value: "vaccination" },
              { title: "Microchip", value: "microchip" },
            ],
          },
        ],
      });

      return Effect.gen(function* () {
        const terminal = yield* PromptTestTerminal;
        yield* terminal.inputKey("down");
        yield* terminal.inputKey("space");
        yield* terminal.inputKey("up");
        yield* terminal.inputKey("space");
        yield* terminal.inputKey("enter");

        const result = yield* Prompt.run(prompt);
        assert.deepEqual(result, ["vaccination"]);

        const frames = toFrames(harness.output);
        assert.isTrue(findFrame(frames, "At most 1 choices are allowed") !== undefined);
      }).pipe(Effect.provide(Layer.mergeAll(harness.layer, FileSystem.layerNoop({}), Path.layer)));
    },
  );
});
