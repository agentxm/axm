import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export const AppErrorCodes = [
  "usage",
  "not_found",
  "auth",
  "forbidden",
  "conflict",
  "rate_limit",
  "network",
  "validation",
  "internal",
] as const;

export const AppErrorCodeSchema = Schema.Literals(AppErrorCodes).annotate({
  identifier: "AppErrorCode",
  title: "AppError Code",
  description: "Coarse category for AppError results, used for exit codes and JSON envelopes.",
});
export type AppErrorCode = typeof AppErrorCodeSchema.Type;

export const AppErrorCodeDescriptions: Readonly<Record<AppErrorCode, string>> = {
  usage: "Caller invoked the CLI incorrectly (bad flag, missing argument).",
  not_found: "Requested resource does not exist.",
  auth: "Caller is not authenticated.",
  forbidden: "Caller is authenticated but lacks permission.",
  conflict: "Operation conflicts with current state (e.g., already exists).",
  rate_limit: "Caller exceeded a rate limit.",
  network: "Network or transport failure reaching a remote service.",
  validation: "Input failed schema or semantic validation.",
  internal: "Unexpected internal error; likely a bug.",
};

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
