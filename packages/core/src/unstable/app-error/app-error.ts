import * as Data from "effect/Data";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export type AppErrorCode =
  | "usage"
  | "not_found"
  | "auth"
  | "forbidden"
  | "conflict"
  | "rate_limit"
  | "network"
  | "validation"
  | "internal";

export const AppErrorCodes: ReadonlyArray<AppErrorCode> = [
  "usage",
  "not_found",
  "auth",
  "forbidden",
  "conflict",
  "rate_limit",
  "network",
  "validation",
  "internal",
];

export const exitCodeFor = (code: AppErrorCode): number => {
  switch (code) {
    case "usage":
      return 2;
    case "not_found":
      return 3;
    case "auth":
      return 4;
    case "forbidden":
      return 5;
    case "conflict":
      return 6;
    case "rate_limit":
      return 7;
    case "network":
      return 8;
    case "validation":
      return 9;
    case "internal":
      return 1;
  }
};

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: AppErrorCode;
  readonly message: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}): AppError =>
  new AppError({
    code: args.code,
    message: args.message,
    ...(args.breadcrumbs !== undefined && args.breadcrumbs.length > 0
      ? { breadcrumbs: args.breadcrumbs }
      : {}),
    cause: args.cause,
  });
