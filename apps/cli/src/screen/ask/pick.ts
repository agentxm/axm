/**
 * The `Pick` kind: several options from a list that narrows as a person types.
 *
 * Every option carries a mark saying whether it is picked, and `space` toggles
 * the one under the caret. Options that name a group sit one step in beneath
 * the group's header, whose mark says whether all, some, or none of them are
 * picked and which toggles them together. The left arrow folds the caret's
 * group to its header and the right arrow opens it again. Typing narrows the
 * list to the options whose title, details, or group contain what was typed,
 * and a group with none of them goes. The list shows as much as the height it is given allows, and never more
 * than a screenful a person can take in at once; it names what it left out
 * above and below, and keeps the header of the caret's group pinned
 * above it once the header has scrolled away. Neither the reducer nor the view
 * touches the terminal.
 */

import { plain } from "../doc.js";
import type { CalloutNode, Doc, PromptOption, PromptPicked } from "../doc.js";
import {
  isQuitKey,
  isSubmitKey,
  answerDoc,
  promptNode,
  typedText,
  type AskKey,
  type AskKind,
  type AskReducerAction,
  type PickAsk,
  type PickNoun,
} from "./ask.js";
import { listWindow, skippedAbove, windowLines } from "./list-window.js";

/**
 * The most lines a list takes however tall the terminal is, so the question,
 * the caret's details, and the keys stay within a glance of the caret.
 */
const LIST_LINES = 14;
/** The lines kept beneath a list for what the caret's option means, where the height spares them. */
const DETAIL_LINES = 2;
/** The rows a page key moves the caret: a screenful less the rows that carry the eye across. */
const PAGE_ROWS = LIST_LINES - 2;
/** The options a folded group names before it counts the rest. */
const NAMED_IN_FOLD = 3;
/** The groups a list names below its window before it counts the rest. */
const NAMED_BELOW = 2;

/** Where the caret stands, what is picked, what narrows the list, and what was refused. */
export interface PickState {
  /** The caret's row among the rows the filter leaves. */
  readonly cursor: number;
  /** The positions in the question's options of those picked. */
  readonly picked: ReadonlySet<number>;
  readonly filter: string;
  /** The groups folded to their headers. A filter shows its matches whatever is folded. */
  readonly folded: ReadonlySet<string>;
  /** Why the last key was refused, until the next key that changes something. */
  readonly problem?: string;
}

export type PickAction = AskReducerAction<PickState, ReadonlyArray<number>>;

/**
 * One line of the list: a group's header with every option in the group and
 * those the filter leaves, or one option by its position in the question.
 */
export type PickRow =
  | {
      readonly _tag: "Group";
      readonly label: string;
      readonly members: ReadonlyArray<number>;
      readonly shown: ReadonlyArray<number>;
      /** Whether the group's options stay behind its header. */
      readonly folded: boolean;
    }
  | { readonly _tag: "Option"; readonly index: number; readonly grouped: boolean };

/** The question opens on its first row, with the options it marks as selected picked. */
export const initialPickState = <A>(ask: PickAsk<A>): PickState => ({
  cursor: 0,
  picked: new Set(
    ask.options.flatMap((option, index) => (option.selected === true ? [index] : [])),
  ),
  filter: "",
  folded: new Set(),
});

const contains = (text: string, filter: string): boolean =>
  text.toLowerCase().includes(filter.toLowerCase());

/** Whether what was typed is in the option's title, its details, or its group's name. */
const matches = <A>(option: PickAsk<A>["options"][number], filter: string): boolean =>
  contains(option.title, filter) ||
  (option.details ?? []).some((detail) => contains(plain(detail), filter)) ||
  (option.group !== undefined && contains(option.group, filter));

/**
 * The rows the filter leaves, in order: options without a group first, then
 * each group in the order it first appears, its header before its options. A
 * group none of whose options match is left out, header and all, and a folded
 * group keeps its header alone while nothing is typed.
 */
export const pickRows = <A>(
  ask: PickAsk<A>,
  filter: string,
  folded: ReadonlySet<string> = new Set(),
): ReadonlyArray<PickRow> => {
  const shown = (indices: ReadonlyArray<number>) =>
    indices.filter((index) => {
      const option = ask.options[index];
      return option !== undefined && matches(option, filter);
    });
  const ungrouped = ask.options.flatMap((option, index) =>
    option.group === undefined ? [index] : [],
  );
  const labels = [
    ...new Set(ask.options.flatMap((option) => (option.group === undefined ? [] : [option.group]))),
  ];
  return [
    ...shown(ungrouped).map((index): PickRow => ({ _tag: "Option", index, grouped: false })),
    ...labels.flatMap((label): ReadonlyArray<PickRow> => {
      const members = ask.options.flatMap((option, index) =>
        option.group === label ? [index] : [],
      );
      const visible = shown(members);
      if (visible.length === 0) return [];
      const header: PickRow = {
        _tag: "Group",
        label,
        members,
        shown: visible,
        folded: filter.length === 0 && folded.has(label),
      };
      return header.folded
        ? [header]
        : [header, ...visible.map((index): PickRow => ({ _tag: "Option", index, grouped: true }))];
    }),
  ];
};

const count = (noun: PickNoun, n: number): string =>
  n === 1 ? `one ${noun.one}` : `${String(n)} ${noun.other}`;

/** What is wrong with picking `size` options, or `undefined` when nothing is. */
const outOfBounds = <A>(ask: PickAsk<A>, size: number): string | undefined =>
  ask.min !== undefined && size < ask.min
    ? `Pick at least ${count(ask.noun, ask.min)}`
    : ask.max !== undefined && size > ask.max
      ? `Pick at most ${count(ask.noun, ask.max)}`
      : undefined;

/**
 * `targets` toggled together: picked when any of them is not, else unpicked.
 * Picking past the question's `max` is refused with the reason and changes
 * nothing.
 */
const rowsOf = <A>(ask: PickAsk<A>, state: PickState): ReadonlyArray<PickRow> =>
  pickRows(ask, state.filter, state.folded);

const toggled = <A>(
  ask: PickAsk<A>,
  state: PickState,
  targets: ReadonlyArray<number>,
  fillCapacity = false,
): PickAction => {
  if (targets.length === 0) return { _tag: "Next", state };
  const picked = new Set(state.picked);
  const outside = [...picked].filter((index) => !targets.includes(index)).length;
  const capacity = ask.max === undefined ? targets.length : Math.max(0, ask.max - outside);
  const pickable = Math.min(targets.length, capacity);
  const pickedTargets = targets.filter((index) => picked.has(index)).length;
  const pickAll = fillCapacity
    ? pickedTargets < pickable
    : targets.some((index) => !picked.has(index));
  for (const index of targets) {
    if (pickAll && (ask.max === undefined || picked.size < ask.max)) picked.add(index);
    else picked.delete(index);
  }
  if (pickAll && !targets.every((index) => picked.has(index))) {
    return {
      _tag: "Next",
      state: fillCapacity
        ? {
            cursor: state.cursor,
            picked,
            filter: state.filter,
            folded: state.folded,
            ...(ask.max === undefined
              ? {}
              : { problem: `Pick at most ${count(ask.noun, ask.max)}` }),
          }
        : { ...state, problem: `Pick at most ${count(ask.noun, ask.max ?? picked.size)}` },
    };
  }
  return {
    _tag: "Next",
    state: { cursor: state.cursor, picked, filter: state.filter, folded: state.folded },
  };
};

/**
 * The list narrowed by `filter`. The caret stays on the option it stood on
 * while that option still shows, else moves to the first option that does.
 */
const refiltered = <A>(ask: PickAsk<A>, state: PickState, filter: string): PickAction => {
  const before = rowsOf(ask, state)[state.cursor];
  const rows = pickRows(ask, filter, state.folded);
  const kept =
    before?._tag === "Option"
      ? rows.findIndex((row) => row._tag === "Option" && row.index === before.index)
      : -1;
  const cursor =
    kept >= 0
      ? kept
      : Math.max(
          0,
          rows.findIndex((row) => row._tag === "Option"),
        );
  return { _tag: "Next", state: { cursor, picked: state.picked, filter, folded: state.folded } };
};

const moved = <A>(ask: PickAsk<A>, state: PickState, step: number): PickAction => {
  const last = Math.max(0, rowsOf(ask, state).length - 1);
  return {
    _tag: "Next",
    state: {
      cursor: Math.min(Math.max(0, state.cursor + step), last),
      picked: state.picked,
      filter: state.filter,
      folded: state.folded,
    },
  };
};

/**
 * The caret's group folded to its header, or opened again. The caret goes to
 * the header, which is where a folded group's options went. A filter shows its
 * matches whatever is folded, so the key does nothing while one is typed.
 */
const refolded = <A>(ask: PickAsk<A>, state: PickState, fold: boolean): PickAction => {
  const row = rowsOf(ask, state)[state.cursor];
  const label = row?._tag === "Group" ? row.label : ask.options[row?.index ?? -1]?.group;
  if (state.filter.length > 0 || label === undefined) return { _tag: "Next", state };
  const folded = new Set(state.folded);
  if (fold) folded.add(label);
  else folded.delete(label);
  const cursor = pickRows(ask, state.filter, folded).findIndex(
    (candidate) => candidate._tag === "Group" && candidate.label === label,
  );
  return {
    _tag: "Next",
    state: {
      cursor: fold ? Math.max(0, cursor) : state.cursor,
      picked: state.picked,
      filter: state.filter,
      folded,
    },
  };
};

/** The options the filter leaves, by their positions in the question. */
const shownOptions = (rows: ReadonlyArray<PickRow>): ReadonlyArray<number> =>
  rows.flatMap((row) => (row._tag === "Option" ? [row.index] : []));

/**
 * One key against one list. The arrows move the caret and stop at either end,
 * the page keys move it a screenful, and `home` and `end` take it to either
 * end; the left arrow folds the caret's group and the right arrow opens it;
 * `space` toggles the row under it, a group's header toggling the options of
 * the group that show; `ctrl`+`a` toggles every option that shows; `enter`
 * submits what is picked once it is within the question's bounds. Typed text
 * narrows the list, `backspace` takes back a character, and `ctrl`+`u` or
 * escape clears the filter. Escape with nothing typed, and an interrupt,
 * cancel.
 */
export const reducePick = <A>(ask: PickAsk<A>, state: PickState, key: AskKey): PickAction => {
  if (isQuitKey(key)) return { _tag: "Cancel" };
  if (key.name === "escape") {
    return state.filter.length === 0 ? { _tag: "Cancel" } : refiltered(ask, state, "");
  }
  if (isSubmitKey(key)) {
    const problem = outOfBounds(ask, state.picked.size);
    return problem === undefined
      ? {
          _tag: "Submit",
          submission: [...state.picked].sort((left, right) => left - right),
        }
      : { _tag: "Next", state: { ...state, problem } };
  }
  if (key.name === "up") return moved(ask, state, -1);
  if (key.name === "down") return moved(ask, state, 1);
  if (key.name === "pageup") return moved(ask, state, -PAGE_ROWS);
  if (key.name === "pagedown") return moved(ask, state, PAGE_ROWS);
  if (key.name === "home") return moved(ask, state, Number.NEGATIVE_INFINITY);
  if (key.name === "end") return moved(ask, state, Number.POSITIVE_INFINITY);
  if (key.name === "left") return refolded(ask, state, true);
  if (key.name === "right") return refolded(ask, state, false);
  const rows = rowsOf(ask, state);
  if (key.name === "space" || key.char === " ") {
    const row = rows[state.cursor];
    if (row === undefined) return { _tag: "Next", state };
    return toggled(
      ask,
      state,
      row._tag === "Group" ? row.shown : [row.index],
      row._tag === "Group",
    );
  }
  if (key.ctrl && key.name === "a") return toggled(ask, state, shownOptions(rows));
  if (key.ctrl && key.name === "u") return refiltered(ask, state, "");
  if (key.name === "backspace") {
    return state.filter.length === 0
      ? { _tag: "Next", state }
      : refiltered(ask, state, [...state.filter].slice(0, -1).join(""));
  }
  const typed = typedText(key);
  return typed === undefined
    ? { _tag: "Next", state }
    : refiltered(ask, state, `${state.filter}${typed}`);
};

const pickedOf = (indices: ReadonlyArray<number>, picked: ReadonlySet<number>): number =>
  indices.filter((index) => picked.has(index)).length;

const markOf = (indices: ReadonlyArray<number>, picked: ReadonlySet<number>): PromptPicked => {
  const n = pickedOf(indices, picked);
  return n === 0 ? "none" : n === indices.length ? "all" : "some";
};

/**
 * One row as the list paints it. A group's header counts its picked options —
 * of all of them, or of those that show while the list is filtered — and its
 * mark stands for all of them either way. A folded header names the first of
 * the options behind it.
 */
const optionOf = <A>(ask: PickAsk<A>, state: PickState, row: PickRow): PromptOption => {
  if (row._tag === "Group") {
    const filtered = state.filter.length > 0;
    const counted = filtered ? row.shown : row.members;
    const titles = row.members.flatMap((index) => {
      const option = ask.options[index];
      return option === undefined ? [] : [option.title];
    });
    const rest = titles.length - NAMED_IN_FOLD;
    const named = titles.slice(0, NAMED_IN_FOLD).join(", ");
    return {
      title: [{ text: row.label, bold: true }],
      picked: markOf(row.members, state.picked),
      details: [
        `${String(pickedOf(counted, state.picked))} of ${String(counted.length)}${filtered ? " shown" : ""}`,
        ...(row.folded ? [rest > 0 ? `${named} +${String(rest)}` : named] : []),
      ],
    };
  }
  const option = ask.options[row.index];
  return {
    title: option?.title ?? "",
    ...(option?.details === undefined ? {} : { details: option.details }),
    picked: state.picked.has(row.index) ? "all" : "none",
    ...(row.grouped ? { depth: 1 } : {}),
  };
};

/**
 * The header of the group the caret's option is in, which stays above a
 * window that has scrolled past it.
 */
const groupHeaderOf =
  (rows: ReadonlyArray<PickRow>) =>
  (cursor: number): number | undefined => {
    const row = rows[cursor];
    if (row?._tag !== "Option" || !row.grouped) return undefined;
    for (let index = cursor - 1; index >= 0; index -= 1) {
      if (rows[index]?._tag === "Group") return index;
    }
    return undefined;
  };

/** The question as the live scene shows it in `rows` lines while it stands open. */
export const pickDoc = <A>(ask: PickAsk<A>, state: PickState, rows: number): Doc => {
  const list = rowsOf(ask, state);
  // The question, its note, the hint, a refusal, and the lines that name the
  // caret's details where the list cannot carry them take their lines before
  // any row does. The details take a second line only where no row pays for it.
  const described = ask.options.some((option) => (option.details?.length ?? 0) > 0);
  const fixed = 2 + (ask.note === undefined ? 0 : 1) + (state.problem === undefined ? 0 : 1);
  const detailLines = !described ? 0 : rows - fixed - DETAIL_LINES >= LIST_LINES ? DETAIL_LINES : 1;
  const room = Math.min(LIST_LINES, rows - fixed - detailLines);
  const window = listWindow(list.length, state.cursor, room, groupHeaderOf(list));
  const shownRow = (index: number): PromptOption => {
    const row = list[index];
    const option = row === undefined ? { title: "" } : optionOf(ask, state, row);
    return index === state.cursor ? { ...option, current: true } : option;
  };
  const above = skippedAbove(window);
  const filtered = state.filter.length > 0;
  const shown = shownOptions(list);
  // A pick the filter hides still counts, and would otherwise look lost.
  const hidden = filtered ? state.picked.size - pickedOf(shown, state.picked) : 0;
  const selected = `${String(state.picked.size)} of ${String(ask.options.length)} selected${hidden === 0 ? "" : ` (${String(hidden)} hidden)`}`;
  const grouped = list.some((row) => row._tag === "Group");
  // The groups whose headers the window has not reached, so a person knows
  // what the rows left out below are before scrolling to them.
  const unseen = list
    .slice(window.end)
    .flatMap((row) => (row._tag === "Group" ? [`${row.label} (${String(row.shown.length)})`] : []));
  const below =
    unseen.length > NAMED_BELOW
      ? `${unseen.slice(0, NAMED_BELOW).join(", ")} +${String(unseen.length - NAMED_BELOW)} groups`
      : unseen.join(", ");
  const submit =
    ask.verb === undefined
      ? "confirm"
      : state.picked.size === 0
        ? ask.verb
        : `${ask.verb} ${String(state.picked.size)}`;
  return [
    promptNode(ask, {
      chips: [],
      filter: state.filter,
      options: [
        ...(window.pinned === undefined ? [] : [shownRow(window.pinned)]),
        ...Array.from({ length: window.end - window.start }, (_, offset) => {
          const option = shownRow(window.start + offset);
          return offset === 0 && above > 0 ? { ...option, before: above } : option;
        }),
      ],
      more: list.length - window.end,
      ...(below.length === 0 ? {} : { below }),
      ...(detailLines === 0 ? {} : { detailLines }),
      // A window squeezed past its room has no line left to lend.
      ...(described && window.end < list.length && windowLines(window, list.length) <= room
        ? { spare: shownRow(window.end) }
        : {}),
      hint: filtered
        ? {
            status: [selected, `${String(shown.length)} shown`],
            keys: [
              { key: "^a", word: "all shown" },
              { key: "esc", word: "clears the filter" },
            ],
          }
        : {
            status: [selected],
            keys: [
              { key: "arrows", word: "move" },
              ...(grouped ? [{ key: "sides", word: "fold" }] : []),
              { key: "space", word: "toggle" },
              { key: "^a", word: "all" },
              { key: "enter", word: submit },
            ],
          },
    }),
    ...(state.problem === undefined
      ? []
      : [{ _tag: "callout", tone: "warn", title: state.problem } satisfies CalloutNode]),
  ];
};

/** Titles an answer line names before it counts the rest. */
const NAMED_IN_ANSWER = 3;

/**
 * The one transcript line an answered list leaves behind: the titles picked,
 * the first few by name and the rest as a count.
 */
export const pickAnswer = <A>(ask: PickAsk<A>, picked: ReadonlyArray<number>): Doc => {
  const titles = picked.flatMap((index) => {
    const option = ask.options[index];
    return option === undefined ? [] : [option.title];
  });
  const rest = titles.length - NAMED_IN_ANSWER;
  const named = titles.slice(0, NAMED_IN_ANSWER).join(", ");
  return answerDoc(
    ask,
    titles.length === 0 ? "none" : rest > 0 ? `${named} +${String(rest)}` : named,
  );
};

/** A `Pick` as the `Screen` runs it. */
export const pickKind = <A>(ask: PickAsk<A>): AskKind<PickState, A> => ({
  initial: initialPickState(ask),
  reduce: (state, key) => {
    const action = reducePick(ask, state, key);
    return action._tag === "Submit"
      ? {
          _tag: "Submit",
          value: ask.answer(action.submission),
          answer: pickAnswer(ask, action.submission),
        }
      : action;
  },
  view: (state, facts) => pickDoc(ask, state, facts.rows),
});
