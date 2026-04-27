/** Per-scope append-only diagnostics buffer for settings/lockfile/scanner warnings. */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

/** A degraded-state observation surfaced through a scoped diagnostics buffer. */
export interface Warning {
  readonly source: "settings" | "lockfile" | "scanner";
  readonly message: string;
  readonly path?: string;
  readonly code?: string;
}

/** Append-only, snapshot-readable warning buffer for one scoped workspace read model. */
export interface Diagnostics {
  readonly append: (warning: Warning) => Effect.Effect<void>;
  readonly snapshot: Effect.Effect<ReadonlyArray<Warning>>;
}

/** Build a `Diagnostics` helper around a caller-owned `Ref<ReadonlyArray<Warning>>`. */
export const makeDiagnostics = (ref: Ref.Ref<ReadonlyArray<Warning>>): Diagnostics => ({
  append: Effect.fn("workspace.context.diagnostics.append")(function* (warning: Warning) {
    yield* Ref.update(ref, (current) => [...current, warning]);
  }),
  snapshot: Effect.gen(function* () {
    const current = yield* Ref.get(ref);
    return current;
  }).pipe(Effect.withSpan("workspace.context.diagnostics.snapshot")),
});
