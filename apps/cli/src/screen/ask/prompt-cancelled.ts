import * as Data from "effect/Data";

export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}
