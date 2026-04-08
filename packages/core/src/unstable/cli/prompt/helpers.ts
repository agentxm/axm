import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { dual } from "effect/Function";
import type * as Prompt from "effect/unstable/cli/Prompt";
import type * as Terminal from "effect/Terminal";

export const unless: {
  <A>(
    value: Option.Option<A>,
  ): (self: Prompt.Prompt<A>) => Effect.Effect<A, Terminal.QuitError, Prompt.Environment>;
  <A>(
    self: Prompt.Prompt<A>,
    value: Option.Option<A>,
  ): Effect.Effect<A, Terminal.QuitError, Prompt.Environment>;
} = dual(2, <A>(self: Prompt.Prompt<A>, value: Option.Option<A>) =>
  Option.match(value, {
    onNone: () => self,
    onSome: (resolved) => Effect.succeed(resolved),
  }),
);

export const autoConfirm: {
  (
    yes: boolean,
  ): (
    self: Prompt.Prompt<boolean>,
  ) => Effect.Effect<boolean, Terminal.QuitError, Prompt.Environment>;
  (
    self: Prompt.Prompt<boolean>,
    yes: boolean,
  ): Effect.Effect<boolean, Terminal.QuitError, Prompt.Environment>;
} = dual(2, (self: Prompt.Prompt<boolean>, yes: boolean) => (yes ? Effect.succeed(true) : self));
