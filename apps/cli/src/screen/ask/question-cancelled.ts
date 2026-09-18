import * as Data from "effect/Data";

export class QuestionCancelled extends Data.TaggedError("QuestionCancelled")<{
  readonly message: string;
}> {}
