import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

/**
 * Named exit codes for the CLI. `Success` is the only exit code without an
 * `AppErrorCode` counterpart; the rest map 1:1 with `AppErrorCode` via
 * `exitCodeFor`.
 */
export const ExitCode = {
  /** Success. Also used for help output and cancelled prompts. */
  Success: 0,
  /** Command ran, but reported issues that need attention (e.g. `axm lint` findings). Pairs with `AppErrorCode` `issues`. */
  Issues: 1,
  /** Invalid command, flags, or arguments. Fix the invocation. Pairs with `AppErrorCode` `usage`. */
  Usage: 2,
  /** Resource doesn't exist or isn't visible. Pairs with `AppErrorCode` `not_found`. */
  NotFound: 3,
  /** Credentials are missing, expired, or invalid. Sign in again. Pairs with `AppErrorCode` `auth`. */
  Auth: 4,
  /** Signed in, but not authorized for this action. Pairs with `AppErrorCode` `forbidden`. */
  Forbidden: 5,
  /** Conflicts with current state (already exists, version mismatch, concurrent update). Reconcile and retry. Pairs with `AppErrorCode` `conflict`. */
  Conflict: 6,
  /** Rate or quota exceeded. Retry after a backoff. Pairs with `AppErrorCode` `rate_limit`. */
  RateLimit: 7,
  /** Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable. Pairs with `AppErrorCode` `network`. */
  Network: 8,
  /** Input parsed but failed validation. Correct it and retry. Pairs with `AppErrorCode` `validation`. */
  Validation: 9,
  /** Unexpected failure. Likely a bug — please report it. Pairs with `AppErrorCode` `internal`. */
  Internal: 10,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** `ExitCode` names that carry an `AppErrorCode`. Every exit code except `Success`. */
type ErrorExitName = Exclude<keyof typeof ExitCode, "Success">;

/**
 * Single source for the snake-case `AppErrorCode` strings (the values emitted
 * in `--json` output). Keys are `ExitCode` names.
 *
 * `satisfies Record<ErrorExitName, string>` enforces 1:1 with `ExitCode` minus
 * `Success` — adding an `ExitCode` without an entry here (or removing one)
 * won't compile.
 */
const AppErrorCodeByExitName = {
  Issues: "issues",
  Usage: "usage",
  NotFound: "not_found",
  Auth: "auth",
  Forbidden: "forbidden",
  Conflict: "conflict",
  RateLimit: "rate_limit",
  Network: "network",
  Validation: "validation",
  Internal: "internal",
} as const satisfies Record<ErrorExitName, string>;

export type AppErrorCode = (typeof AppErrorCodeByExitName)[ErrorExitName];

/**
 * Tuple of every `AppErrorCode`. Listed via member reads so the tuple type is
 * preserved for `Schema.Literals` without a cast.
 */
export const AppErrorCodes = [
  AppErrorCodeByExitName.Issues,
  AppErrorCodeByExitName.Usage,
  AppErrorCodeByExitName.NotFound,
  AppErrorCodeByExitName.Auth,
  AppErrorCodeByExitName.Forbidden,
  AppErrorCodeByExitName.Conflict,
  AppErrorCodeByExitName.RateLimit,
  AppErrorCodeByExitName.Network,
  AppErrorCodeByExitName.Validation,
  AppErrorCodeByExitName.Internal,
] as const;

export const AppErrorCodeSchema = Schema.Literals(AppErrorCodes).annotate({
  identifier: "AppErrorCode",
  title: "AppError Code",
  description: "Error category. Sets the exit code and the `code` field in JSON output.",
});

const ExitCodeByAppErrorCode: Readonly<Record<AppErrorCode, ExitCode>> = {
  issues: ExitCode.Issues,
  usage: ExitCode.Usage,
  not_found: ExitCode.NotFound,
  auth: ExitCode.Auth,
  forbidden: ExitCode.Forbidden,
  conflict: ExitCode.Conflict,
  rate_limit: ExitCode.RateLimit,
  network: ExitCode.Network,
  validation: ExitCode.Validation,
  internal: ExitCode.Internal,
};

export const exitCodeFor = (code: AppErrorCode): ExitCode => ExitCodeByAppErrorCode[code];

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
