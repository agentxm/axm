import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { LocalInspectionRequest } from "../show/local-inspection-selection.js";

export const CheckKindSchema = Schema.Literals([
  "compatibility",
  "ownership",
  "lint",
  "convergence",
]);
export type CheckKind = typeof CheckKindSchema.Type;

export const DEFAULT_CHECKS: ReadonlyArray<CheckKind> = [
  "compatibility",
  "ownership",
  "lint",
  "convergence",
];

export interface LocalCheckRequest extends LocalInspectionRequest {
  readonly checks: ReadonlyArray<CheckKind>;
  readonly strict: boolean;
}

class InvalidCheckSelection extends Data.TaggedError("InvalidCheckSelection")<{
  readonly detail: string;
}> {}

/** Parse only the requested assessments; identity resolution belongs to inspection. */
export const parseCheckSelection = (input: string | undefined) =>
  Effect.gen(function* () {
    if (input === undefined) return DEFAULT_CHECKS;
    const selected: CheckKind[] = [];
    for (const raw of input.split(",")) {
      const value = raw.trim();
      const check = yield* Schema.decodeUnknownEffect(CheckKindSchema)(value).pipe(
        Effect.mapError(
          () =>
            new InvalidCheckSelection({
              detail:
                value.length === 0
                  ? "Select a nonempty set of checks"
                  : `Unknown check: ${value}. Choose ${DEFAULT_CHECKS.join(", ")}`,
            }),
        ),
      );
      if (!selected.includes(check)) selected.push(check);
    }
    return selected;
  });
