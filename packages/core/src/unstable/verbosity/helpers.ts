import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Verbosity } from "./verbosity.js";

export const whenNotQuiet = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R | Verbosity> =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("normal")) return Option.some(yield* effect);
    return Option.none();
  });

export const whenVerbose = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R | Verbosity> =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("verbose")) return Option.some(yield* effect);
    return Option.none();
  });

export const whenDebug = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R | Verbosity> =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("debug")) return Option.some(yield* effect);
    return Option.none();
  });
