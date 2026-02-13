import * as Data from "effect/Data";

export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}
