import * as Data from "effect/Data";
import * as Option from "effect/Option";

export class CliError extends Data.TaggedError("CliError")<{
  readonly code: string;
  readonly what: string;
  readonly details: ReadonlyArray<string>;
  readonly howToFix: Option.Option<string>;
  readonly cause: unknown;
}> {}

export const makeCliError = (args: {
  readonly code: string;
  readonly what: string;
  readonly details?: ReadonlyArray<string>;
  readonly howToFix?: string;
  readonly cause?: unknown;
}): CliError =>
  new CliError({
    code: args.code,
    what: args.what,
    details: args.details ?? [],
    howToFix: Option.fromUndefinedOr(args.howToFix),
    cause: args.cause,
  });
