import { describe, expect, it } from "vitest";

import { paintText } from "../paint-text.js";
import type { AskKey, ConfirmAsk, ConfirmChoice } from "./ask.js";
import {
  confirmAnswer,
  confirmDoc,
  confirmKind,
  initialConfirmState,
  reduceConfirm,
  type ConfirmAction,
} from "./confirm.js";

type GateAnswer = "declined" | "approved" | "details";

const no: ConfirmChoice<GateAnswer> = { key: "n", word: "no", value: "declined" };
const yes: ConfirmChoice<GateAnswer> = { key: "y", word: "yes", value: "approved" };
const details: ConfirmChoice<GateAnswer> = {
  key: "d",
  word: "details",
  value: "details",
  transcript: false,
};

const gate: ConfirmAsk<GateAnswer> = {
  _tag: "Confirm",
  question: "Apply 4 changes?",
  label: "Apply changes",
  choices: [no, yes, details],
};

/** A key as the terminal reports it: printable keys carry their character. */
const key = (name: string, options?: { readonly ctrl?: boolean }): AskKey => ({
  name,
  ...(name.length === 1 && options?.ctrl !== true ? { char: name } : {}),
  ctrl: options?.ctrl === true,
});

/** Replay a sequence of keys and answer with what the last one did. */
const replay = (keys: ReadonlyArray<AskKey>): ConfirmAction<"declined" | "approved" | "details"> =>
  keys.reduce<ConfirmAction<"declined" | "approved" | "details">>(
    (action, next) => (action._tag === "Next" ? reduceConfirm(gate, action.state, next) : action),
    { _tag: "Next", state: initialConfirmState },
  );

describe("reduceConfirm", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly keys: ReadonlyArray<AskKey>;
    readonly expected: ConfirmAction<GateAnswer>;
  }> = [
    {
      name: "enter takes the first choice, which is the default",
      keys: [key("return")],
      expected: { _tag: "Submit", choice: no },
    },
    {
      name: "a choice's own key answers outright",
      keys: [key("y")],
      expected: { _tag: "Submit", choice: yes },
    },
    {
      name: "the key matches whatever case it was typed in",
      keys: [{ name: "Y", char: "Y", ctrl: false }],
      expected: { _tag: "Submit", choice: yes },
    },
    {
      name: "right moves which choice enter takes",
      keys: [key("right"), key("return")],
      expected: { _tag: "Submit", choice: yes },
    },
    {
      name: "left wraps round to the last choice",
      keys: [key("left"), key("return")],
      expected: { _tag: "Submit", choice: details },
    },
    {
      name: "tab moves forward like right",
      keys: [key("tab"), key("tab"), key("return")],
      expected: { _tag: "Submit", choice: details },
    },
    {
      name: "escape cancels",
      keys: [key("escape")],
      expected: { _tag: "Cancel" },
    },
    {
      name: "an interrupt cancels",
      keys: [key("c", { ctrl: true })],
      expected: { _tag: "Cancel" },
    },
    {
      name: "end of input cancels",
      keys: [key("d", { ctrl: true })],
      expected: { _tag: "Cancel" },
    },
    {
      name: "a key no choice claims leaves the question exactly as it stood",
      keys: [key("right"), key("q")],
      expected: { _tag: "Next", state: { index: 1 } },
    },
  ];

  it.each(cases)("$name", ({ keys, expected }) => {
    expect(replay(keys)).toEqual(expected);
  });
});

describe("confirmDoc", () => {
  const paint = (width: number, state = initialConfirmState) =>
    paintText(confirmDoc(gate, state), { width, colors: false });

  it("puts the question and its chips on one line while both fit", () => {
    expect(paint(80)).toEqual([" ?   Apply 4 changes?    N  no    y  yes    d  details"]);
  });

  it("drops the chips to their own line at the content column", () => {
    expect(paint(48)).toEqual([" ?   Apply 4 changes?", "      N  no    y  yes    d  details"]);
  });

  it("drops the chips' words before it cuts anything, and never ends in a space", () => {
    expect(paint(30)).toEqual([" ?   Apply 4 changes?", "      N     y     d"]);
  });

  it("fills and capitalises the choice enter takes, wherever it sits", () => {
    expect(paint(80, { index: 1 }).join("")).toContain("n  no    Y  yes");
  });

  it("puts a note beneath the question", () => {
    const doc = confirmDoc({ ...gate, note: "Nothing has been written yet." }, initialConfirmState);
    expect(paintText(doc, { width: 80, colors: false }).at(-1)).toBe(
      "     Nothing has been written yet.",
    );
  });

  it("marks the filled chip with reverse video only where there is color", () => {
    const colored = paintText(confirmDoc(gate, initialConfirmState), {
      width: 80,
      colors: true,
    }).join("");
    expect(colored).toContain("[7m");
    expect(paint(80).join("")).not.toContain("");
  });
});

describe("confirmAnswer", () => {
  it("leaves exactly one transcript line", () => {
    const lines = paintText(confirmAnswer(gate, yes), { width: 80, colors: false });
    expect(lines).toEqual([" ✔   Apply changes                 yes"]);
  });

  it("falls back to the question when no label was given", () => {
    const { label: _label, ...unlabelled } = gate;
    expect(confirmAnswer(unlabelled, no)).toEqual([
      { _tag: "answer", mark: "ok", label: "Apply 4 changes?", value: "no" },
    ]);
  });

  it("lets a non-settling choice omit the answer line", () => {
    expect(confirmKind(gate).reduce(initialConfirmState, key("d"))).toEqual({
      _tag: "Submit",
      value: "details",
      answer: [],
    });
  });
});
