import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";

export interface GroupMultiselectChoice<A> {
  readonly title: string;
  readonly value: A;
  readonly description?: string;
}

export interface GroupMultiselectGroup<A> {
  readonly label: string;
  readonly choices: ReadonlyArray<GroupMultiselectChoice<A>>;
  readonly selectableHeader?: boolean;
}

export interface GroupMultiselectOptions<A> {
  readonly message: string;
  readonly groups: ReadonlyArray<GroupMultiselectGroup<A>>;
  readonly maxPerPage?: number;
  readonly min?: number;
  readonly max?: number;
  readonly validate?: (value: ReadonlyArray<A>) => Effect.Effect<ReadonlyArray<A>, string>;
}

type HeaderRow = {
  readonly _tag: "Header";
  readonly groupIndex: number;
  readonly label: string;
  readonly selectableHeader: boolean;
  readonly choiceIndices: ReadonlyArray<number>;
};

type ChoiceRow = {
  readonly _tag: "Choice";
  readonly groupIndex: number;
  readonly choiceIndex: number;
  readonly choiceIndexGlobal: number;
  readonly title: string;
  readonly description?: string;
};

type Row = HeaderRow | ChoiceRow;

interface GroupMultiselectState {
  readonly cursor: number;
  readonly selectedIndices: Set<number>;
  readonly error: Option.Option<string>;
}

interface GroupMultiselectModel<A> {
  readonly rows: ReadonlyArray<Row>;
  readonly choices: ReadonlyArray<GroupMultiselectChoice<A>>;
}

type GroupMultiselectAction<A> = PromptTypes.Action<GroupMultiselectState, ReadonlyArray<A>>;

const beep = <A>(): GroupMultiselectAction<A> => ({ _tag: "Beep" });

const nextFrame = <A>(state: GroupMultiselectState): GroupMultiselectAction<A> => ({
  _tag: "NextFrame",
  state,
});

const submit = <A>(value: ReadonlyArray<A>): GroupMultiselectAction<A> => ({
  _tag: "Submit",
  value,
});

const entriesToDisplay = (cursor: number, total: number, maxVisible?: number) => {
  const max = maxVisible === undefined ? total : maxVisible;
  let startIndex = Math.min(total - max, cursor - Math.floor(max / 2));
  if (startIndex < 0) {
    startIndex = 0;
  }
  const endIndex = Math.min(startIndex + max, total);
  return { startIndex, endIndex };
};

const buildModel = <A>(options: GroupMultiselectOptions<A>): GroupMultiselectModel<A> => {
  const rows: Array<Row> = [];
  const choices: Array<GroupMultiselectChoice<A>> = [];

  for (let groupIndex = 0; groupIndex < options.groups.length; groupIndex++) {
    const group = options.groups[groupIndex];
    if (group === undefined) {
      continue;
    }

    const choiceIndices: Array<number> = [];
    rows.push({
      _tag: "Header",
      groupIndex,
      label: group.label,
      selectableHeader: group.selectableHeader === true,
      choiceIndices,
    });

    for (let choiceIndex = 0; choiceIndex < group.choices.length; choiceIndex++) {
      const choice = group.choices[choiceIndex];
      if (choice === undefined) {
        continue;
      }

      const choiceIndexGlobal = choices.length;
      choices.push(choice);
      choiceIndices.push(choiceIndexGlobal);
      rows.push({
        _tag: "Choice",
        groupIndex,
        choiceIndex,
        choiceIndexGlobal,
        title: choice.title,
        ...(choice.description === undefined ? {} : { description: choice.description }),
      });
    }
  }

  return { rows, choices };
};

const selectedValues = <A>(state: GroupMultiselectState, model: GroupMultiselectModel<A>) =>
  Array.from(state.selectedIndices)
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const choice = model.choices[index];
      return choice === undefined ? [] : [choice.value];
    });

const selectedCount = (indices: ReadonlyArray<number>, selected: Set<number>): number =>
  indices.reduce((count, index) => count + (selected.has(index) ? 1 : 0), 0);

const renderChoiceLine = (row: ChoiceRow, state: GroupMultiselectState, active: boolean) => {
  const selected = state.selectedIndices.has(row.choiceIndexGlobal);
  const marker = selected ? "[x]" : "[ ]";
  const cursor = active ? ">" : " ";
  const description = row.description === undefined ? "" : ` - ${row.description}`;
  return `${cursor} ${marker} ${row.title}${description}`;
};

const renderHeaderLine = (row: HeaderRow, state: GroupMultiselectState, active: boolean) => {
  const cursor = active ? ">" : " ";
  if (!row.selectableHeader) {
    return `${cursor} ${row.label}`;
  }

  const selected = selectedCount(row.choiceIndices, state.selectedIndices);
  const marker = selected === 0 ? "[ ]" : selected === row.choiceIndices.length ? "[x]" : "[-]";
  return `${cursor} ${marker} ${row.label}`;
};

const renderRows = <A>(
  state: GroupMultiselectState,
  model: GroupMultiselectModel<A>,
  options: GroupMultiselectOptions<A>,
) => {
  if (model.rows.length === 0) {
    return ["(no choices)"];
  }

  const toDisplay = entriesToDisplay(state.cursor, model.rows.length, options.maxPerPage);
  const lines: Array<string> = [];

  if (toDisplay.startIndex > 0) {
    lines.push("...");
  }

  for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
    const row = model.rows[index];
    if (row === undefined) {
      continue;
    }

    const active = state.cursor === index;
    lines.push(
      row._tag === "Header"
        ? renderHeaderLine(row, state, active)
        : renderChoiceLine(row, state, active),
    );
  }

  if (toDisplay.endIndex < model.rows.length) {
    lines.push("...");
  }

  return lines;
};

const renderFrame = <A>(
  state: GroupMultiselectState,
  model: GroupMultiselectModel<A>,
  options: GroupMultiselectOptions<A>,
) => {
  const lines = [options.message, ...renderRows(state, model, options)];
  if (Option.isSome(state.error)) {
    lines.push(`! ${state.error.value}`);
  }
  return lines.join("\n");
};

const toggleChoice = <A>(
  state: GroupMultiselectState,
  options: GroupMultiselectOptions<A>,
  row: ChoiceRow,
): Effect.Effect<GroupMultiselectAction<A>> => {
  const nextSelected = new Set(state.selectedIndices);
  if (nextSelected.has(row.choiceIndexGlobal)) {
    nextSelected.delete(row.choiceIndexGlobal);
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        selectedIndices: nextSelected,
        error: Option.none(),
      }),
    );
  }

  if (options.max !== undefined && nextSelected.size + 1 > options.max) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At most ${options.max} choices are allowed`),
      }),
    );
  }

  nextSelected.add(row.choiceIndexGlobal);
  return Effect.succeed(
    nextFrame<A>({
      ...state,
      selectedIndices: nextSelected,
      error: Option.none(),
    }),
  );
};

const toggleHeader = <A>(
  state: GroupMultiselectState,
  options: GroupMultiselectOptions<A>,
  row: HeaderRow,
): Effect.Effect<GroupMultiselectAction<A>> => {
  if (!row.selectableHeader || row.choiceIndices.length === 0) {
    return Effect.succeed(beep<A>());
  }

  const nextSelected = new Set(state.selectedIndices);
  const selected = selectedCount(row.choiceIndices, nextSelected);
  const shouldSelectAll = selected !== row.choiceIndices.length;

  if (shouldSelectAll) {
    const additionalSelections = row.choiceIndices.reduce(
      (count, index) => count + (nextSelected.has(index) ? 0 : 1),
      0,
    );
    const nextCount = nextSelected.size + additionalSelections;
    if (options.max !== undefined && nextCount > options.max) {
      return Effect.succeed(
        nextFrame<A>({
          ...state,
          error: Option.some(`At most ${options.max} choices are allowed`),
        }),
      );
    }

    for (const index of row.choiceIndices) {
      nextSelected.add(index);
    }
  } else {
    for (const index of row.choiceIndices) {
      nextSelected.delete(index);
    }
  }

  return Effect.succeed(
    nextFrame<A>({
      ...state,
      selectedIndices: nextSelected,
      error: Option.none(),
    }),
  );
};

const submitSelection = <A>(
  state: GroupMultiselectState,
  model: GroupMultiselectModel<A>,
  options: GroupMultiselectOptions<A>,
): Effect.Effect<GroupMultiselectAction<A>> => {
  const values = selectedValues(state, model);

  if (options.min !== undefined && values.length < options.min) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At least ${options.min} choices are required`),
      }),
    );
  }

  if (options.max !== undefined && values.length > options.max) {
    return Effect.succeed(
      nextFrame<A>({
        ...state,
        error: Option.some(`At most ${options.max} choices are allowed`),
      }),
    );
  }

  return Effect.match(
    (options.validate ?? ((selected: ReadonlyArray<A>) => Effect.succeed(selected)))(values),
    {
      onFailure: (error) =>
        nextFrame<A>({
          ...state,
          error: Option.some(error),
        }),
      onSuccess: (validatedValues) => submit<A>(validatedValues),
    },
  );
};

const moveCursor = <A>(
  state: GroupMultiselectState,
  delta: number,
  totalRows: number,
): Effect.Effect<GroupMultiselectAction<A>> => {
  if (totalRows === 0) {
    return Effect.succeed(beep<A>());
  }

  const nextCursor = (state.cursor + delta + totalRows) % totalRows;
  return Effect.succeed(
    nextFrame<A>({
      ...state,
      cursor: nextCursor,
      error: Option.none(),
    }),
  );
};

export const groupMultiselect = <A>(
  options: GroupMultiselectOptions<A>,
): PromptTypes.Prompt<ReadonlyArray<A>> => {
  const model = buildModel(options);
  const initialState: GroupMultiselectState = {
    cursor: 0,
    selectedIndices: new Set(),
    error: Option.none(),
  };

  return Prompt.custom(initialState, {
    render: (state, action) =>
      Effect.succeed(action._tag === "Beep" ? "\x07" : renderFrame(state, model, options)),
    process: (input, state): Effect.Effect<GroupMultiselectAction<A>> => {
      if (model.rows.length === 0) {
        switch (input.key.name) {
          case "enter":
          case "return":
            return submitSelection(state, model, options);
          default:
            return Effect.succeed(beep<A>());
        }
      }

      switch (input.key.name) {
        case "k":
        case "up":
          return moveCursor(state, -1, model.rows.length);
        case "j":
        case "down":
        case "tab":
          return moveCursor(state, 1, model.rows.length);
        case "space": {
          const row = model.rows[state.cursor];
          if (row === undefined) {
            return Effect.succeed(beep<A>());
          }
          return row._tag === "Header"
            ? toggleHeader(state, options, row)
            : toggleChoice(state, options, row);
        }
        case "enter":
        case "return":
          return submitSelection(state, model, options);
        default:
          return Effect.succeed(beep<A>());
      }
    },
    clear: () => Effect.succeed("\x1B[2J\x1B[H"),
  });
};
