// ---------------------------------------------------------------------------
// CommandExit — controlled process termination signal
//
// Used to exit with a specific code (e.g., 1 after showing help) without
// triggering error formatting. Not a real error — just a control flow signal.
// ---------------------------------------------------------------------------

import * as Data from "effect/Data";

export class CommandExit extends Data.TaggedError("CommandExit")<{
  readonly exitCode: number;
}> {}

export const commandExit = (exitCode: number): CommandExit => new CommandExit({ exitCode });

// The process adapter also classifies errors crossing the host Promise boundary.
export const isCommandExit = (error: unknown): error is CommandExit =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "CommandExit" &&
  "exitCode" in error &&
  typeof error.exitCode === "number";
