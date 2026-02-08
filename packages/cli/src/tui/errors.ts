import * as Data from "effect/Data";
import type * as Option from "effect/Option";

export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}
