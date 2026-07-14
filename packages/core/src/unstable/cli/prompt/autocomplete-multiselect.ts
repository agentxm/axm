import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";

export type AutocompleteMultiselectChoice<A> = PromptTypes.SelectChoice<A>;

export interface AutocompleteMultiselectOptions<A> {
  readonly message: string;
  readonly choices: ReadonlyArray<AutocompleteMultiselectChoice<A>>;
  readonly maxPerPage?: number;
  readonly min?: number;
  readonly max?: number;
  readonly filterLabel?: string;
  readonly filterPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly hint?: string;
  readonly selectionCountMessage?: (selected: ReadonlyArray<A>) => string;
  readonly submissionMessage?: (selected: ReadonlyArray<A>) => string;
  readonly validate?: (value: ReadonlyArray<A>) => Effect.Effect<ReadonlyArray<A>, string>;
}

const DEFAULT_HINT = "↑/↓ move · space toggle · enter confirm · type to filter";

interface AutocompleteMultiselectState {
  readonly query: string;
  readonly cursor: number;
  readonly selectedIndices: Set<number>;
  readonly filtered: ReadonlyArray<number>;
  readonly error: Option.Option<string>;
}

type AutocompleteMultiselectAction<A> = PromptTypes.Action<
  AutocompleteMultiselectState,
  ReadonlyArray<A>
>;

const beep = <A>(): AutocompleteMultiselectAction<A> => ({ _tag: "Beep" });

const nextFrame = <A>(state: AutocompleteMultiselectState): AutocompleteMultiselectAction<A> => ({
  _tag: "NextFrame",
  state,
});

const submit = <A>(value: ReadonlyArray<A>): AutocompleteMultiselectAction<A> => ({
  _tag: "Submit",
  value,
});

const normalize = (value: string): string => value.toLowerCase();

const filterChoices = <A>(
  choices: ReadonlyArray<AutocompleteMultiselectChoice<A>>,
  query: string,
): ReadonlyArray<number> => {
  if (query.length === 0) {
    return choices.map((_, index) => index);
  }

  const normalizedQuery = normalize(query);
  const filtered: Array<number> = [];
  for (let index = 0; index < choices.length; index += 1) {
    const choice = choices[index];
    if (choice !== undefined && normalize(choice.title).includes(normalizedQuery)) {
      filtered.push(index);
    }
  }
  return filtered;
};

const firstVisibleSelectedIndex = (
  filtered: ReadonlyArray<number>,
  selectedIndices: Set<number>,
): number => {
  for (let index = 0; index < filtered.length; index += 1) {
    const choiceIndex = filtered[index];
    if (choiceIndex !== undefined && selectedIndices.has(choiceIndex)) {
      return index;
    }
  }
  return 0;
};

const cursorForFiltered = (
  previous: AutocompleteMultiselectState["cursor"],
  previousFiltered: ReadonlyArray<number>,
  filtered: ReadonlyArray<number>,
): number => {
  if (filtered.length === 0) {
    return 0;
  }

  const previousChoiceIndex = previousFiltered[previous];
  if (previousChoiceIndex === undefined) {
    return 0;
  }

  const nextCursor = filtered.indexOf(previousChoiceIndex);
  return nextCursor === -1 ? 0 : nextCursor;
};

const entriesToDisplay = (cursor: number, total: number, maxVisible?: number) => {
  const max = maxVisible === undefined ? total : maxVisible;
  let startIndex = Math.min(total - max, cursor - Math.floor(max / 2));
  if (startIndex < 0) {
    startIndex = 0;
  }
  const endIndex = Math.min(startIndex + max, total);
  return { startIndex, endIndex };
};

const refreshState = <A>(
  state: AutocompleteMultiselectState,
  choices: ReadonlyArray<AutocompleteMultiselectChoice<A>>,
  query: string,
): AutocompleteMultiselectState => {
  const filtered = filterChoices(choices, query);
  const cursor =
    query.length === 0
      ? firstVisibleSelectedIndex(filtered, state.selectedIndices)
      : cursorForFiltered(state.cursor, state.filtered, filtered);

  return {
    ...state,
    query,
    cursor,
    filtered,
    error: Option.none(),
  };
};

const selectedValues = <A>(
  choices: ReadonlyArray<AutocompleteMultiselectChoice<A>>,
  selectedIndices: Set<number>,
): ReadonlyArray<A> =>
  Array.from(selectedIndices)
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const choice = choices[index];
      return choice === undefined ? [] : [choice.value];
    });

const submitSelection = <A>(
  state: AutocompleteMultiselectState,
  options: AutocompleteMultiselectOptions<A>,
): Effect.Effect<AutocompleteMultiselectAction<A>> => {
  const value = selectedValues(options.choices, state.selectedIndices);

  if (options.min !== undefined && value.length < options.min) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At least ${options.min} are required`),
      }),
    );
  }

  if (options.max !== undefined && value.length > options.max) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At most ${options.max} choices are allowed`),
      }),
    );
  }

  return Effect.match((options.validate ?? Effect.succeed)(value), {
    onFailure: (error) =>
      nextFrame<A>({
        ...state,
        error: Option.some(error),
      }),
    onSuccess: (nextValue) => submit<A>(nextValue),
  });
};

const toggleCurrentChoice = <A>(
  state: AutocompleteMultiselectState,
  options: AutocompleteMultiselectOptions<A>,
): Effect.Effect<AutocompleteMultiselectAction<A>> => {
  const choiceIndex = state.filtered[state.cursor];
  if (choiceIndex === undefined) {
    return Effect.succeed(beep<A>());
  }

  const choice = options.choices[choiceIndex];
  if (choice === undefined || choice.disabled === true) {
    return Effect.succeed(beep<A>());
  }

  const selectedIndices = new Set(state.selectedIndices);
  if (selectedIndices.has(choiceIndex)) {
    selectedIndices.delete(choiceIndex);
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        selectedIndices,
        error: Option.none(),
      }),
    );
  }

  if (options.max !== undefined && selectedIndices.size >= options.max) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At most ${options.max} choices are allowed`),
      }),
    );
  }

  selectedIndices.add(choiceIndex);
  return Effect.succeed(
    nextFrame<A>({
      ...state,
      selectedIndices,
      error: Option.none(),
    }),
  );
};

const moveCursor = <A>(
  state: AutocompleteMultiselectState,
  delta: number,
): Effect.Effect<AutocompleteMultiselectAction<A>> => {
  if (state.filtered.length === 0) {
    return Effect.succeed(beep<A>());
  }

  const nextCursor = (state.cursor + delta + state.filtered.length) % state.filtered.length;
  return Effect.succeed(
    nextFrame<A>({
      ...state,
      cursor: nextCursor,
      error: Option.none(),
    }),
  );
};

const renderPrompt = <A>(
  state: AutocompleteMultiselectState,
  options: AutocompleteMultiselectOptions<A>,
  submitted: boolean,
): string => {
  const selected = selectedValues(options.choices, state.selectedIndices);
  if (submitted) {
    const message = options.submissionMessage?.(selected) ?? `${selected.length} selected`;
    return `✓ ${message}\n\n`;
  }

  const filterLabel = options.filterLabel ?? "filter";
  const filterPlaceholder = options.filterPlaceholder ?? "type to filter";
  const emptyMessage = options.emptyMessage ?? "No matches";
  const query = state.query.length === 0 ? filterPlaceholder : state.query;
  const filterLine = `${filterLabel}: ${query}`;

  const choices =
    state.filtered.length === 0
      ? [`  ${emptyMessage}`]
      : (() => {
          const window = entriesToDisplay(state.cursor, state.filtered.length, options.maxPerPage);
          const visibleChoices: Array<string> = [];

          if (window.startIndex > 0) {
            visibleChoices.push("...");
          }

          for (
            let visibleIndex = window.startIndex;
            visibleIndex < window.endIndex;
            visibleIndex += 1
          ) {
            const choiceIndex = state.filtered[visibleIndex];
            if (choiceIndex === undefined) {
              visibleChoices.push(`${visibleIndex === state.cursor ? ">" : " "} [ ]`);
              continue;
            }

            const choice = options.choices[choiceIndex];
            if (choice === undefined) {
              visibleChoices.push(`${visibleIndex === state.cursor ? ">" : " "} [ ]`);
              continue;
            }

            const cursor = visibleIndex === state.cursor ? ">" : " ";
            const selected = state.selectedIndices.has(choiceIndex) ? "[x]" : "[ ]";
            const description = choice.description === undefined ? "" : ` - ${choice.description}`;
            visibleChoices.push(`${cursor} ${selected} ${choice.title}${description}`);
          }

          if (window.endIndex < state.filtered.length) {
            visibleChoices.push("...");
          }

          return visibleChoices;
        })();

  const errorLine = Option.match(state.error, {
    onNone: () => "",
    onSome: (message) => `! ${message}`,
  });

  const countLine = options.selectionCountMessage?.(selected) ?? `${selected.length} selected`;
  const hintLine = options.hint ?? DEFAULT_HINT;

  return [`? ${options.message}`, filterLine, ...choices, countLine, hintLine, errorLine]
    .filter((line) => line.length > 0)
    .join("\n");
};

export const autocompleteMultiselect = <const A>(
  options: AutocompleteMultiselectOptions<A>,
): PromptTypes.Prompt<ReadonlyArray<A>> => {
  const initialSelectedIndices = new Set<number>();
  for (let index = 0; index < options.choices.length; index += 1) {
    const choice = options.choices[index];
    if (choice !== undefined && choice.selected === true) {
      initialSelectedIndices.add(index);
    }
  }

  const initialFiltered = filterChoices(options.choices, "");
  const initialState: AutocompleteMultiselectState = {
    query: "",
    cursor: firstVisibleSelectedIndex(initialFiltered, initialSelectedIndices),
    selectedIndices: initialSelectedIndices,
    filtered: initialFiltered,
    error: Option.none(),
  };

  return Prompt.custom(initialState, {
    render: (state, action) =>
      Effect.succeed(renderPrompt(state, options, action._tag === "Submit")),
    process: (input, state): Effect.Effect<AutocompleteMultiselectAction<A>> => {
      switch (input.key.name) {
        case " ":
        case "space":
          return toggleCurrentChoice(state, options);
        case "enter":
        case "return":
          return submitSelection(state, options);
        case "backspace":
          if (state.query.length === 0) {
            return Effect.succeed(beep<A>());
          }
          return Effect.succeed(
            nextFrame<A>(refreshState(state, options.choices, state.query.slice(0, -1))),
          );
        case "up":
        case "k":
          return moveCursor(state, -1);
        case "down":
        case "j":
        case "tab":
          return moveCursor(state, 1);
        case "u":
          if (input.key.ctrl) {
            return Effect.succeed(nextFrame<A>(refreshState(state, options.choices, "")));
          }
          break;
      }

      if (Option.isSome(input.input)) {
        return Effect.succeed(
          nextFrame<A>(refreshState(state, options.choices, `${state.query}${input.input.value}`)),
        );
      }

      return Effect.succeed(beep<A>());
    },
    clear: () => Effect.succeed("\x1B[2J\x1B[H"),
  });
};
