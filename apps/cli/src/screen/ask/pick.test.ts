import { describe, expect, it } from "vitest";

import { paintText } from "../paint-text.js";
import { asciiGlyphs } from "../glyphs.js";
import { pickAsk, type AskKey, type PickAsk, type PickOption } from "./ask.js";
import {
  initialPickState,
  pickAnswer,
  pickDoc,
  pickKind,
  pickRows,
  reducePick,
  type PickAction,
  type PickState,
} from "./pick.js";

const skill = (title: string, details: string, selected?: true): PickOption<string> => ({
  title,
  details: [details],
  value: title,
  group: "Skills",
  ...(selected === undefined ? {} : { selected }),
});

const subagent = (title: string, details: string): PickOption<string> => ({
  title,
  details: [details],
  value: title,
  group: "Subagents",
});

/** The reference board's toolkit: four skills, two already picked, and two subagents. */
const toolkit = pickAsk({
  question: "Which extensions should be installed?",
  label: "Extensions",
  noun: { one: "extension", other: "extensions" },
  options: [
    skill("code-review", "Reviews a diff before you open a pull request", true),
    skill("triage", "Sorts incoming issues by severity", true),
    skill("changelog", "Drafts release notes from merged work"),
    skill("standup", "Summarises yesterday from your commits"),
    subagent("reviewer", "A second reader for risky changes"),
    subagent("planner", "Breaks a goal into ordered tasks"),
  ],
});

/** A flat list with bounds: at least one, at most two. */
const agents = pickAsk({
  question: "Select agents to configure",
  label: "Agents",
  noun: { one: "agent", other: "agents" },
  min: 1,
  max: 2,
  options: [
    { title: "Claude Code", value: "claude-code" },
    { title: "Codex", value: "codex" },
    { title: "Cursor", value: "cursor" },
  ],
});

const key = (name: string, options?: { readonly ctrl?: boolean }): AskKey => ({
  name,
  ...(name.length === 1 && options?.ctrl !== true ? { char: name } : {}),
  ctrl: options?.ctrl === true,
});

const space: AskKey = { name: "space", char: " ", ctrl: false };

const typed = (text: string): ReadonlyArray<AskKey> => [...text].map((char) => key(char));

const replay = <A>(ask: PickAsk<A>, keys: ReadonlyArray<AskKey>): PickAction =>
  keys.reduce<PickAction>(
    (action, next) => (action._tag === "Next" ? reducePick(ask, action.state, next) : action),
    { _tag: "Next", state: initialPickState(ask) },
  );

const stateAfter = <A>(ask: PickAsk<A>, keys: ReadonlyArray<AskKey>): PickState => {
  const action = replay(ask, keys);
  if (action._tag !== "Next") throw new Error(`the list settled: ${action._tag}`);
  return action.state;
};

const picked = (state: PickState): ReadonlyArray<number> =>
  [...state.picked].sort((left, right) => left - right);

describe("pickRows", () => {
  it("lists each group's header before its options, in the order groups appear", () => {
    expect(pickRows(toolkit, "").map((row) => row._tag)).toEqual([
      "Group",
      "Option",
      "Option",
      "Option",
      "Option",
      "Group",
      "Option",
      "Option",
    ]);
  });

  it("keeps a matching option's header and drops a group with no matches", () => {
    const rows = pickRows(toolkit, "RE");
    expect(rows).toEqual([
      { _tag: "Group", label: "Skills", members: [0, 1, 2, 3], shown: [0] },
      { _tag: "Option", index: 0, grouped: true },
      { _tag: "Group", label: "Subagents", members: [4, 5], shown: [4] },
      { _tag: "Option", index: 4, grouped: true },
    ]);
    expect(pickRows(toolkit, "plan")).toEqual([
      { _tag: "Group", label: "Subagents", members: [4, 5], shown: [5] },
      { _tag: "Option", index: 5, grouped: true },
    ]);
  });

  it("lists options without a group without a header", () => {
    expect(pickRows(agents, "c")).toEqual([
      { _tag: "Option", index: 0, grouped: false },
      { _tag: "Option", index: 1, grouped: false },
      { _tag: "Option", index: 2, grouped: false },
    ]);
  });
});

describe("reducePick", () => {
  it("opens on the first row with the selected options picked", () => {
    expect(initialPickState(toolkit)).toEqual({
      cursor: 0,
      picked: new Set([0, 1]),
      filter: "",
    });
  });

  it("toggles the option under the caret with space", () => {
    expect(picked(stateAfter(agents, [space]))).toEqual([0]);
    expect(picked(stateAfter(agents, [space, space]))).toEqual([]);
    expect(picked(stateAfter(agents, [key("down"), key("down"), space]))).toEqual([2]);
  });

  it("toggles a partly picked group's options on, then off", () => {
    // The caret opens on the Skills header, two of whose four are picked.
    expect(picked(stateAfter(toolkit, [space]))).toEqual([0, 1, 2, 3]);
    expect(picked(stateAfter(toolkit, [space, space]))).toEqual([]);
  });

  it("fills the remaining capacity when a group contains more choices than the maximum", () => {
    const bounded = pickAsk({
      question: "Pick skills",
      label: "Skills",
      noun: { one: "skill", other: "skills" },
      max: 3,
      options: [
        { title: "one", value: "one", group: "Skills", selected: true },
        { title: "two", value: "two", group: "Skills" },
        { title: "three", value: "three", group: "Skills" },
        { title: "four", value: "four", group: "Skills" },
      ],
    });
    expect(picked(stateAfter(bounded, [space]))).toEqual([0, 1, 2]);
  });

  it("unselects a partial group when its selectable members already fill the maximum", () => {
    const bounded = pickAsk({
      question: "Pick skills",
      label: "Skills",
      noun: { one: "skill", other: "skills" },
      max: 2,
      options: [
        { title: "one", value: "one", group: "Skills", selected: true },
        { title: "two", value: "two", group: "Skills", selected: true },
        { title: "three", value: "three", group: "Skills" },
      ],
    });
    expect(picked(stateAfter(bounded, [space]))).toEqual([]);
  });

  it("toggles only the options of a group that the filter shows", () => {
    // `re` leaves code-review under Skills; the caret moves to it, then up to
    // its header, which toggles code-review alone.
    expect(picked(stateAfter(toolkit, [...typed("re"), key("up"), space]))).toEqual([1]);
  });

  it("toggles every option that shows with ctrl+a", () => {
    const all = key("a", { ctrl: true });
    expect(picked(stateAfter(toolkit, [all]))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(picked(stateAfter(toolkit, [all, all]))).toEqual([]);
    expect(picked(stateAfter(toolkit, [...typed("plan"), all]))).toEqual([0, 1, 5]);
  });

  it("narrows the list as text is typed and moves the caret to the first match", () => {
    const state = stateAfter(toolkit, typed("re"));
    expect(state.filter).toBe("re");
    // The Skills header stays at row 0; code-review is the first option.
    expect(state.cursor).toBe(1);
  });

  it("keeps the caret on its row while the row still shows", () => {
    // The caret stands on reviewer (row 6) when `r` is typed; it still shows.
    const state = stateAfter(toolkit, [...Array.from({ length: 6 }, () => key("down")), key("r")]);
    expect(pickRows(toolkit, state.filter)[state.cursor]).toEqual({
      _tag: "Option",
      index: 4,
      grouped: true,
    });
  });

  it("takes a character back with backspace and clears the filter with ctrl+u", () => {
    expect(stateAfter(toolkit, [...typed("rev"), key("backspace")]).filter).toBe("re");
    expect(stateAfter(toolkit, [...typed("rev"), key("u", { ctrl: true })]).filter).toBe("");
  });

  it("clears a typed filter with escape, and cancels with escape once it is clear", () => {
    const cleared = stateAfter(toolkit, [...typed("re"), key("escape")]);
    expect(cleared.filter).toBe("");
    expect(picked(cleared)).toEqual([0, 1]);
    expect(replay(toolkit, [...typed("re"), key("escape"), key("escape")])).toEqual({
      _tag: "Cancel",
    });
  });

  it("cancels on an interrupt", () => {
    expect(replay(toolkit, [key("c", { ctrl: true })])).toEqual({ _tag: "Cancel" });
  });

  it("stops the caret at either end rather than wrapping", () => {
    expect(stateAfter(agents, [key("up")]).cursor).toBe(0);
    expect(stateAfter(agents, [key("down"), key("down"), key("down")]).cursor).toBe(2);
  });

  it("submits what is picked, in the order the options are listed", () => {
    expect(replay(agents, [key("down"), space, key("up"), space, key("return")])).toEqual({
      _tag: "Submit",
      submission: [0, 1],
    });
  });

  it("refuses to submit fewer than the question's minimum, naming it", () => {
    const state = stateAfter(agents, [key("return")]);
    expect(state.problem).toBe("Pick at least one agent");
    // The next change clears the refusal.
    expect(stateAfter(agents, [key("return"), space]).problem).toBeUndefined();
  });

  it("refuses to pick past the question's maximum and changes nothing", () => {
    const state = stateAfter(agents, [space, key("down"), space, key("down"), space]);
    expect(picked(state)).toEqual([0, 1]);
    expect(state.problem).toBe("Pick at most 2 agents");
    expect(picked(stateAfter(agents, [key("a", { ctrl: true })]))).toEqual([]);
  });
});

describe("pickDoc", () => {
  const paint = <A>(ask: PickAsk<A>, state: PickState, width = 80, rows = 24) =>
    paintText(pickDoc(ask, state, rows), { width, colors: false });

  it("draws each group with a tri-state mark and a count, its options one step in", () => {
    expect(paint(toolkit, initialPickState(toolkit))).toEqual([
      " ?   Which extensions should be installed?  type to filter",
      " ❯ ◪ Skills                        2 of 4",
      "   ◉   code-review                 Reviews a diff before you open a pull request",
      "   ◉   triage                      Sorts incoming issues by severity",
      "   ◯   changelog                   Drafts release notes from merged work",
      "   ◯   standup                     Summarises yesterday from your commits",
      "   ◯ Subagents                     0 of 2",
      "   ◯   reviewer                    A second reader for risky changes",
      "   ◯   planner                     Breaks a goal into ordered tasks",
      "2 selected · ↑↓ move · space toggle · ^a all · enter confirm",
    ]);
  });

  it("shows what was typed, counts only what shows, and says how to clear it", () => {
    expect(paint(toolkit, stateAfter(toolkit, typed("re")))).toEqual([
      " ?   Which extensions should be installed?  re",
      "   ◪ Skills                        1 of 1 shown",
      " ❯ ◉   code-review                 Reviews a diff before you open a pull request",
      "   ◯ Subagents                     0 of 1 shown",
      "   ◯   reviewer                    A second reader for risky changes",
      "2 selected · 2 of 6 shown · esc clears the filter",
    ]);
  });

  it("pins the caret's group header above a window that has scrolled past it", () => {
    const state = stateAfter(toolkit, [key("down"), key("down"), key("down")]);
    expect(paint(toolkit, state, 80, 6)).toEqual([
      " ?   Which extensions should be installed?  type to filter",
      "   ◪ Skills                        2 of 4",
      "     ↑ 2 more",
      " ❯ ◯   changelog                   Drafts release notes from merged work",
      "     ↓ 4 more",
      "2 selected · ↑↓ move · space toggle · ^a all · enter confirm",
    ]);
  });

  it("drops descriptions before names, and key words before keys, at narrow widths", () => {
    expect(paint(agents, initialPickState(agents), 36)).toEqual([
      " ?   Select agents to configure",
      " ❯ ◯ Claude Code",
      "   ◯ Codex",
      "   ◯ Cursor",
      "0 selected · space · ^a all · enter",
    ]);
  });

  it("names a refusal beneath the hint", () => {
    expect(paint(agents, stateAfter(agents, [key("return")])).at(-1)).toBe(
      " ▲   Pick at least one agent",
    );
  });

  it("paints the same list with seven-bit marks", () => {
    const lines = paintText(pickDoc(toolkit, initialPickState(toolkit), 24), {
      width: 80,
      colors: false,
      glyphs: asciiGlyphs,
    });
    expect(lines.slice(1, 3)).toEqual([
      " > [-] Skills                      2 of 4",
      "   [x]   code-review               Reviews a diff before you open a pull request",
    ]);
    expect(lines.at(-1)).toBe("2 selected - up/down move - space toggle - ^a all - enter confirm");
  });
});

describe("pickAnswer", () => {
  it("names up to three titles and counts the rest", () => {
    const paintAnswer = (indices: ReadonlyArray<number>) =>
      paintText(pickAnswer(toolkit, indices), { width: 80, colors: false });
    expect(paintAnswer([0, 1])).toEqual([" ✔   Extensions                    code-review, triage"]);
    expect(paintAnswer([0, 1, 2, 4, 5])).toEqual([
      " ✔   Extensions                    code-review, triage, changelog +2",
    ]);
    expect(paintAnswer([])).toEqual([" ✔   Extensions                    none"]);
  });
});

describe("pickKind", () => {
  it("answers with the values of the options picked", () => {
    const kind = pickKind(agents);
    const action = [space, key("down"), key("down"), space, key("return")].reduce<
      ReturnType<typeof kind.reduce>
    >((current, next) => (current._tag === "Next" ? kind.reduce(current.state, next) : current), {
      _tag: "Next",
      state: kind.initial,
    });
    expect(action._tag === "Submit" ? action.value : undefined).toEqual(["claude-code", "cursor"]);
  });
});
