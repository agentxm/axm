// ---------------------------------------------------------------------------
// EffectCliExit — controlled process termination signal
//
// Used to exit with a specific code (e.g., 1 after showing help) without
// triggering error formatting. Not a real error — just a control flow signal.
// ---------------------------------------------------------------------------

import * as Data from "effect/Data";

export class EffectCliExit extends Data.TaggedError("EffectCliExit")<{
  readonly exitCode: number;
}> {}

export const effectCliExit = (exitCode: number): EffectCliExit => new EffectCliExit({ exitCode });

// Duck-type check: instanceof may fail for defects extracted via Cause.squash
export const isEffectCliExit = (error: unknown): error is EffectCliExit =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "EffectCliExit" &&
  "exitCode" in error &&
  typeof error.exitCode === "number";
