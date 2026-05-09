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
  description:
    "Error category. Sets the exit code and the `code` field in JSON output.",
});
export type AppErrorCode = typeof AppErrorCodeSchema.Type;

export const AppErrorCodeDescriptions: Readonly<Record<AppErrorCode, string>> = {
  usage: "Invalid command, flags, or arguments. Fix the invocation.",
  not_found: "Resource doesn't exist or isn't visible.",
  auth: "Credentials are missing, expired, or invalid. Sign in again.",
  forbidden: "Signed in, but not authorized for this action.",
  conflict:
    "Conflicts with current state (already exists, version mismatch, concurrent update). Reconcile and retry.",
  rate_limit: "Rate or quota exceeded. Retry after a backoff.",
  network:
    "Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable.",
  validation: "Input parsed but failed validation. Correct it and retry.",
  internal: "Unexpected failure. Likely a bug — please report it.",
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
