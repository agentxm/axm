import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";

import { paintText } from "../paint-text.js";
import { asciiGlyphs } from "../glyphs.js";
import type { AskKey, InputAsk } from "./ask.js";
import {
  initialInputState,
  inputAnswer,
  inputDoc,
  reduceInput,
  type InputAction,
  type InputState,
} from "./input.js";

const fileName: InputAsk<string> = {
  _tag: "Input",
  question: "Instructions file name",
  placeholder: "docs/AGENTS.md",
  validate: (raw) =>
    raw.trim().length === 0 ? Result.fail("Enter a file name.") : Result.succeed(raw.trim()),
};

const key = (name: string, options?: { readonly ctrl?: boolean }): AskKey => ({
  name,
  ...(name.length === 1 && options?.ctrl !== true ? { char: name } : {}),
  ctrl: options?.ctrl === true,
});

/** Every character of `text` as the key a terminal reports for it. */
const typed = (text: string): ReadonlyArray<AskKey> => [...text].map((char) => key(char));

const replay = (keys: ReadonlyArray<AskKey>, from = initialInputState): InputAction<string> =>
  keys.reduce<InputAction<string>>(
    (action, next) => (action._tag === "Next" ? reduceInput(fileName, action.state, next) : action),
    { _tag: "Next", state: from },
  );

describe("reduceInput", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly keys: ReadonlyArray<AskKey>;
    readonly expected: InputAction<string>;
  }> = [
    {
      name: "typed characters build the line",
      keys: typed("docs"),
      expected: { _tag: "Next", state: { raw: "docs" } },
    },
    {
      name: "enter submits what validate made of the line",
      keys: [...typed(" AGENTS.md "), key("return")],
      expected: {
        _tag: "Submit",
        submission: { value: "AGENTS.md", raw: " AGENTS.md " },
      },
    },
    {
      name: "backspace removes the last character",
      keys: [...typed("docx"), key("backspace"), ...typed("s")],
      expected: { _tag: "Next", state: { raw: "docs" } },
    },
    {
      name: "backspace on an empty line leaves it empty",
      keys: [key("backspace")],
      expected: { _tag: "Next", state: { raw: "" } },
    },
    {
      name: "a refused line stays open with the reason and what was typed",
      keys: [...typed("  "), key("return")],
      expected: { _tag: "Next", state: { raw: "  ", problem: "Enter a file name." } },
    },
    {
      name: "escape cancels",
      keys: [...typed("docs"), key("escape")],
      expected: { _tag: "Cancel" },
    },
    {
      name: "an interrupt cancels",
      keys: [key("c", { ctrl: true })],
      expected: { _tag: "Cancel" },
    },
    {
      name: "a key that types nothing leaves the line as it stood",
      keys: [...typed("docs"), key("left"), key("tab")],
      expected: { _tag: "Next", state: { raw: "docs" } },
    },
  ];

  it.each(cases)("$name", ({ keys, expected }) => {
    expect(replay(keys)).toEqual(expected);
  });

  it("clears the reason with the next edit", () => {
    const refused: InputState = { raw: "", problem: "Enter a file name." };
    expect(replay(typed("d"), refused)).toEqual({ _tag: "Next", state: { raw: "d" } });
  });

  it("accepts a pasted run of text in one key", () => {
    expect(
      reduceInput(fileName, initialInputState, { name: "", char: "a/b.md", ctrl: false }),
    ).toEqual({ _tag: "Next", state: { raw: "a/b.md" } });
  });
});

describe("inputDoc", () => {
  const paint = (state: InputState, width = 80) =>
    paintText(inputDoc(fileName, state), { width, colors: false });

  it("shows the placeholder behind the caret until something is typed", () => {
    expect(paint(initialInputState)).toEqual([" ?   Instructions file name ❯ docs/AGENTS.md"]);
  });

  it("shows the line being typed behind the caret", () => {
    expect(paint({ raw: "docs/CLAUDE.md" })).toEqual([
      " ?   Instructions file name ❯ docs/CLAUDE.md",
    ]);
  });

  it("puts the caret alone at the end of an empty line with no placeholder", () => {
    const { placeholder: _placeholder, ...bare } = fileName;
    expect(paintText(inputDoc(bare, initialInputState), { width: 80, colors: false })).toEqual([
      " ?   Instructions file name ❯",
    ]);
  });

  it("moves the line beneath the question when both do not fit", () => {
    expect(paint({ raw: "docs/team/AGENTS.md" }, 40)).toEqual([
      " ?   Instructions file name",
      "     ❯ docs/team/AGENTS.md",
    ]);
  });

  it("puts the reason a line was refused in the attention mark beneath it", () => {
    expect(paint({ raw: "", problem: "Enter a file name." })).toEqual([
      " ?   Instructions file name ❯ docs/AGENTS.md",
      " ▲   Enter a file name.",
    ]);
  });

  it("paints the ASCII caret and attention mark", () => {
    expect(
      paintText(inputDoc(fileName, { raw: "x", problem: "No." }), {
        width: 80,
        colors: false,
        glyphs: asciiGlyphs,
      }),
    ).toEqual([" ?   Instructions file name > x", " !!  No."]);
  });
});

describe("inputAnswer", () => {
  it("leaves one transcript line with what was typed", () => {
    expect(
      paintText(inputAnswer(fileName, "docs/AGENTS.md"), { width: 80, colors: false }),
    ).toEqual([" ✔   Instructions file name        docs/AGENTS.md"]);
  });
});
