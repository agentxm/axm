import * as p from "@clack/prompts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeCliError, type CliError } from "../../cli-error/index.js";
import { PromptCancelled } from "../../prompt-cancelled.js";
import type {
  ClackAutocompleteConfig,
  ClackAutocompleteMultiselectConfig,
  ClackConfirmConfig,
  ClackGroupMultiselectConfig,
  ClackMultiselectConfig,
  ClackPasswordConfig,
  ClackPathConfig,
  ClackSelectConfig,
  ClackSelectKeyConfig,
  ClackTextConfig,
} from "./types.js";

const wrapPrompt = <T>(thunk: () => Promise<T | symbol>) =>
  Effect.tryPromise({
    try: () => thunk(),
    catch: (error) =>
      makeCliError({
        code: "PROMPT_RENDER_FAILED",
        what: "Prompt failed to render",
        cause: error,
      }),
  }).pipe(
    Effect.flatMap((result) =>
      p.isCancel(result)
        ? Effect.fail(new PromptCancelled({ message: "Operation cancelled." }))
        : Effect.succeed(result as T),
    ),
  );

export interface ClackPromptService {
  readonly text: (config: ClackTextConfig) => Effect.Effect<string, CliError | PromptCancelled>;
  readonly password: (
    config: ClackPasswordConfig,
  ) => Effect.Effect<string, CliError | PromptCancelled>;
  readonly confirm: (
    config: ClackConfirmConfig,
  ) => Effect.Effect<boolean, CliError | PromptCancelled>;
  readonly select: <V>(
    config: ClackSelectConfig<V>,
  ) => Effect.Effect<V, CliError | PromptCancelled>;
  readonly multiselect: <V>(
    config: ClackMultiselectConfig<V>,
  ) => Effect.Effect<ReadonlyArray<V>, CliError | PromptCancelled>;
  readonly groupMultiselect: <V>(
    config: ClackGroupMultiselectConfig<V>,
  ) => Effect.Effect<ReadonlyArray<V>, CliError | PromptCancelled>;
  readonly selectKey: <V extends string>(
    config: ClackSelectKeyConfig<V>,
  ) => Effect.Effect<V, CliError | PromptCancelled>;
  readonly autocomplete: <V>(
    config: ClackAutocompleteConfig<V>,
  ) => Effect.Effect<V, CliError | PromptCancelled>;
  readonly autocompleteMultiselect: <V>(
    config: ClackAutocompleteMultiselectConfig<V>,
  ) => Effect.Effect<ReadonlyArray<V>, CliError | PromptCancelled>;
  readonly path: (config: ClackPathConfig) => Effect.Effect<string, CliError | PromptCancelled>;
}

export class ClackPrompt extends Context.Tag("@axm.sh/cli/clack-effect/ClackPrompt")<
  ClackPrompt,
  ClackPromptService
>() {}

// Assertion needed: our readonly config types are structurally compatible with Clack's
// mutable types, but exactOptionalPropertyTypes prevents direct assignment.
// We cast once at the boundary when passing to Clack functions.
const asClack = <T>(config: unknown): T => config as T;

const makeLiveClackPromptService = (): ClackPromptService => ({
  text: (config) => wrapPrompt(() => p.text(asClack(config))),

  password: (config) => wrapPrompt(() => p.password(asClack(config))),

  confirm: (config) => wrapPrompt(() => p.confirm(asClack(config))),

  select: (config) => wrapPrompt(() => p.select(asClack(config))),

  multiselect: (config) => wrapPrompt(() => p.multiselect(asClack(config))),

  groupMultiselect: (config) => wrapPrompt(() => p.groupMultiselect(asClack(config))),

  selectKey: (config) => wrapPrompt(() => p.selectKey(asClack(config))),

  autocomplete: (config) => wrapPrompt(() => p.autocomplete(asClack(config))),

  autocompleteMultiselect: (config) =>
    wrapPrompt(() => p.autocompleteMultiselect(asClack(config))),

  path: (config) => wrapPrompt(() => p.path(asClack(config))),
});

export const ClackPromptLive: Layer.Layer<ClackPrompt> = Layer.succeed(
  ClackPrompt,
  makeLiveClackPromptService(),
);
