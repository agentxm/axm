import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Cli from "effect/unstable/cli";

const { Prompt } = Cli;

export interface SelectKeyChoice<A> {
  readonly key: string;
  readonly title: string;
  readonly value: A;
  readonly description?: string;
}

export interface SelectKeyOptions<A> {
  readonly message: string;
  readonly choices: ReadonlyArray<SelectKeyChoice<A>>;
  readonly caseSensitive?: boolean;
}

interface SelectKeyState {
  readonly error: Option.Option<string>;
}

const normalizeKey = (key: string, caseSensitive: boolean): string =>
  caseSensitive ? key : key.toLowerCase();

const getInputKey = (input: {
  readonly input: Option.Option<string>;
  readonly key: {
    readonly name: string;
  };
}): string => Option.getOrElse(input.input, () => input.key.name);

const findChoice = <A>(
  key: string,
  choices: ReadonlyArray<SelectKeyChoice<A>>,
  caseSensitive: boolean,
): SelectKeyChoice<A> | undefined => {
  const expected = normalizeKey(key, caseSensitive);
  return choices.find((choice) => normalizeKey(choice.key, caseSensitive) === expected);
};

const renderChoices = <A>(options: SelectKeyOptions<A>): string =>
  options.choices
    .map((choice) => {
      const description = choice.description === undefined ? "" : ` - ${choice.description}`;
      return `${choice.key}) ${choice.title}${description}`;
    })
    .join("\n");

const renderError = (state: SelectKeyState): string =>
  Option.match(state.error, {
    onNone: () => "",
    onSome: (error) => `\n${error}`,
  });

export const selectKey = <A>(options: SelectKeyOptions<A>) =>
  Prompt.custom({ error: Option.none<string>() } satisfies SelectKeyState, {
    render: (state) =>
      Effect.succeed(`${options.message}\n${renderChoices(options)}${renderError(state)}`),
    process: (input, state) => {
      const choice = findChoice(
        getInputKey(input),
        options.choices,
        options.caseSensitive ?? false,
      );
      if (choice === undefined) {
        return Effect.succeed({
          _tag: "NextFrame",
          state: { ...state, error: Option.some("Invalid key") },
        });
      }
      return Effect.succeed({
        _tag: "Submit",
        value: choice.value,
      });
    },
    clear: () => Effect.succeed("\x1B[2J\x1B[H"),
  });
