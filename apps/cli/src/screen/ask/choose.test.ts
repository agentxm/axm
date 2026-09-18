import { describe, expect, it } from "vitest";

import { asciiGlyphs, paintText } from "../paint-text.js";
import type { AskKey, ChooseAsk, ChooseOption } from "./ask.js";
import {
  chooseAnswer,
  chooseDoc,
  initialChooseState,
  reduceChoose,
  type ChooseAction,
} from "./choose.js";

const agents: ChooseOption<string> = {
  title: "AGENTS.md",
  details: ["recommended", "existing", "128 lines"],
  value: "AGENTS.md",
  selected: true,
};
const claude: ChooseOption<string> = {
  title: "CLAUDE.md",
  details: ["existing", "64 lines"],
  value: "CLAUDE.md",
};
const other: ChooseOption<string> = {
  title: "Other…",
  details: ["type a file name"],
  value: "other",
};

const source: ChooseAsk<string> = {
  _tag: "Choose",
  question: "Instructions source",
  options: [agents, claude, other],
};

const key = (name: string, options?: { readonly ctrl?: boolean }): AskKey => ({
  name,
  ...(name.length === 1 && options?.ctrl !== true ? { char: name } : {}),
  ctrl: options?.ctrl === true,
});

const replay = (ask: ChooseAsk<string>, keys: ReadonlyArray<AskKey>): ChooseAction<string> =>
  keys.reduce<ChooseAction<string>>(
    (action, next) => (action._tag === "Next" ? reduceChoose(ask, action.state, next) : action),
    { _tag: "Next", state: initialChooseState(ask) },
  );

describe("reduceChoose", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly keys: ReadonlyArray<AskKey>;
    readonly expected: ChooseAction<string>;
  }> = [
    {
      name: "enter takes the option the question opened on",
      keys: [key("return")],
      expected: { _tag: "Submit", option: agents },
    },
    {
      name: "down moves the caret to the next option",
      keys: [key("down"), key("return")],
      expected: { _tag: "Submit", option: claude },
    },
    {
      name: "the caret stops at the last option rather than wrapping",
      keys: [key("down"), key("down"), key("down"), key("down")],
      expected: { _tag: "Next", state: { index: 2 } },
    },
    {
      name: "the caret stops at the first option rather than wrapping",
      keys: [key("up")],
      expected: { _tag: "Next", state: { index: 0 } },
    },
    {
      name: "up moves the caret back",
      keys: [key("down"), key("down"), key("up"), key("return")],
      expected: { _tag: "Submit", option: claude },
    },
    {
      name: "escape cancels",
      keys: [key("down"), key("escape")],
      expected: { _tag: "Cancel" },
    },
    {
      name: "an interrupt cancels",
      keys: [key("c", { ctrl: true })],
      expected: { _tag: "Cancel" },
    },
    {
      name: "a letter is not an answer and leaves the list as it stood",
      keys: [key("down"), key("y")],
      expected: { _tag: "Next", state: { index: 1 } },
    },
  ];

  it.each(cases)("$name", ({ keys, expected }) => {
    expect(replay(source, keys)).toEqual(expected);
  });

  it("opens on the first option when none is selected", () => {
    const unselected: ChooseAsk<string> = {
      ...source,
      options: [claude, other],
    };
    expect(initialChooseState(unselected)).toEqual({ index: 0 });
  });

  it("opens on the option marked selected wherever it sits", () => {
    const later: ChooseAsk<string> = { ...source, options: [claude, other, agents] };
    expect(initialChooseState(later)).toEqual({ index: 2 });
  });
});

describe("chooseDoc", () => {
  const paint = (width: number, rows = 24, state = initialChooseState(source)) =>
    paintText(chooseDoc(source, state, rows), { width, colors: false });

  it("opens the list under the question with the caret in the gutter", () => {
    expect(paint(80)).toEqual([
      " ?   Instructions source",
      " ❯   AGENTS.md                     recommended · existing · 128 lines",
      "     CLAUDE.md                     existing · 64 lines",
      "     Other…                        type a file name",
    ]);
  });

  it("drops every option's details before it touches a title", () => {
    expect(paint(48)).toEqual([
      " ?   Instructions source",
      " ❯   AGENTS.md",
      "     CLAUDE.md",
      "     Other…",
    ]);
  });

  it("shortens a title too long for the line in the middle", () => {
    const long: ChooseAsk<string> = {
      _tag: "Choose",
      question: "Source",
      options: [{ title: "docs/instructions/shared/AGENTS.md", value: "long" }],
    };
    expect(paintText(chooseDoc(long, { index: 0 }, 24), { width: 24, colors: false })).toEqual([
      " ?   Source",
      " ❯   docs/…/AGENTS.md",
    ]);
  });

  it("paints the same list with the ASCII caret and separator", () => {
    const lines = paintText(chooseDoc(source, initialChooseState(source), 24), {
      width: 80,
      colors: false,
      glyphs: asciiGlyphs,
    });
    expect(lines[1]).toBe(" >   AGENTS.md                     recommended - existing - 128 lines");
  });

  it("fits the list to the rows it is given and names what it left out", () => {
    // Three rows: the question, one option, and the line naming the rest.
    expect(paint(80, 3)).toEqual([
      " ?   Instructions source",
      " ❯   AGENTS.md                     recommended · existing · 128 lines",
      " ·   2 more",
    ]);
  });

  it("keeps the caret in view as it moves past the window", () => {
    expect(paint(80, 3, { index: 2 })).toEqual([
      " ?   Instructions source",
      " ❯   Other…                        type a file name",
      " ·   2 more",
    ]);
  });

  it("gives the note its line before it gives options theirs", () => {
    const noted = { ...source, note: "AXM syncs its contents to each agent." };
    const lines = paintText(chooseDoc(noted, initialChooseState(noted), 4), {
      width: 80,
      colors: false,
    });
    expect(lines).toEqual([
      " ?   Instructions source",
      "     AXM syncs its contents to each agent.",
      " ❯   AGENTS.md                     recommended · existing · 128 lines",
      " ·   2 more",
    ]);
  });
});

describe("chooseAnswer", () => {
  it("leaves one transcript line naming the option chosen", () => {
    expect(paintText(chooseAnswer(source, claude), { width: 80, colors: false })).toEqual([
      " ✔   Instructions source           CLAUDE.md",
    ]);
  });
});
