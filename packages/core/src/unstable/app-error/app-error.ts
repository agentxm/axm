import * as Data from "effect/Data";
import * as Option from "effect/Option";

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: string;
  readonly what: string;
  readonly details: ReadonlyArray<string>;
  readonly howToFix: Option.Option<string>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: string;
  readonly what: string;
  readonly details?: ReadonlyArray<string>;
  readonly howToFix?: string;
  readonly cause?: unknown;
}): AppError =>
  new AppError({
    code: args.code,
    what: args.what,
    details: args.details ?? [],
    howToFix: Option.fromUndefinedOr(args.howToFix),
    cause: args.cause,
  });
