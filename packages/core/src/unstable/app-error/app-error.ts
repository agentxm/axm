import * as Data from "effect/Data";
import * as Option from "effect/Option";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: string;
  readonly what: string;
  readonly howToFix: Option.Option<string>;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: string;
  readonly what: string;
  readonly howToFix?: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}): AppError =>
  new AppError({
    code: args.code,
    what: args.what,
    howToFix: Option.fromUndefinedOr(args.howToFix),
    breadcrumbs: args.breadcrumbs ?? [],
    cause: args.cause,
  });
