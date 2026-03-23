import * as p from "@clack/prompts";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlags } from "../../cli-flags/index.js";
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

export class ClackPrompt extends ServiceMap.Service<
  ClackPrompt,
  ClackPromptService
>()("@axm.sh/cli/clack-effect/ClackPrompt") {}

// Assertion needed: our readonly config types are structurally compatible with Clack's
// mutable types, but exactOptionalPropertyTypes prevents direct assignment.
// We cast once at the boundary when passing to Clack functions.
const asClack = <T>(config: unknown): T => config as T;

const guardedPrompt = <T>(
  nonInteractive: boolean,
  thunk: () => Promise<T | symbol>,
): Effect.Effect<T, CliError | PromptCancelled> =>
  nonInteractive
    ? Effect.fail(
        makeCliError({
          code: "PROMPT_IN_NON_INTERACTIVE",
          what: "Interactive prompt reached in non-interactive mode",
          howToFix:
            "This is a bug — the handler should bypass this prompt when --non-interactive is set",
        }),
      )
    : wrapPrompt(thunk);

const makeLiveClackPromptService = (nonInteractive: boolean): ClackPromptService => ({
  text: (config) => guardedPrompt(nonInteractive, () => p.text(asClack(config))),

  password: (config) => guardedPrompt(nonInteractive, () => p.password(asClack(config))),

  confirm: (config) => guardedPrompt(nonInteractive, () => p.confirm(asClack(config))),

  select: (config) => guardedPrompt(nonInteractive, () => p.select(asClack(config))),

  multiselect: (config) => guardedPrompt(nonInteractive, () => p.multiselect(asClack(config))),

  groupMultiselect: (config) =>
    guardedPrompt(nonInteractive, () => p.groupMultiselect(asClack(config))),

  selectKey: (config) => guardedPrompt(nonInteractive, () => p.selectKey(asClack(config))),

  autocomplete: (config) => guardedPrompt(nonInteractive, () => p.autocomplete(asClack(config))),

  autocompleteMultiselect: (config) =>
    guardedPrompt(nonInteractive, () => p.autocompleteMultiselect(asClack(config))),

  path: (config) => guardedPrompt(nonInteractive, () => p.path(asClack(config))),
});

export const ClackPromptLive: Layer.Layer<ClackPrompt, never, CliFlags> = Layer.effect(
  ClackPrompt,
  Effect.gen(function* () {
    const flags = yield* CliFlags;
    return makeLiveClackPromptService(flags.nonInteractive);
  }),
);
