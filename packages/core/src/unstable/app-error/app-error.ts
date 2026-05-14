import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

/**
 * Named exit codes for the CLI. `Success` is the only exit code without an
 * `AppErrorCode` counterpart; the rest map 1:1 with `AppErrorCode` via
 * `exitCodeFor`.
 *
 * Reserved ranges:
 * - `0` — success
 * - `1`–`12` — AXM application errors (this enum)
 * - `13`–`127` — reserved for future AXM application errors; do not reuse
 * - `128`+ — POSIX signal convention (e.g., 130 SIGINT, 143 SIGTERM); set
 *   by the runtime's signal handlers, not by `AppError`
 *
 * The numeric values diverge from `sysexits.h` deliberately: AXM uses a
 * flat 1–N scheme so the `code` field in JSON output stays the agent-facing
 * discriminator rather than the number.
 *
 * The descriptions here are the canonical wording. Other surfaces — the
 * help topic at `packages/cli/help/topics/exit-codes.md`, docs, error
 * envelopes — should match. A consistency test pins the help topic to
 * these strings; see `app-error.test.ts`.
 */
export const ExitCode = {
  /** Success. Also used for help output and cancelled prompts. */
  Success: 0,
  /** Command ran successfully but reported problems requiring attention (e.g., `axm lint` findings, doctor-style checks). Not lint-only — any "ran but found problems" outcome belongs here. Pairs with `AppErrorCode` `issues`. */
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
  /** Rate limited. Retry after a backoff. Pairs with `AppErrorCode` `rate_limit`. */
  RateLimit: 7,
  /** Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable. Pairs with `AppErrorCode` `network`. */
  Network: 8,
  /** Input parsed but failed validation. Correct it and retry. Pairs with `AppErrorCode` `validation`. */
  Validation: 9,
  /** Unexpected internal error. Likely a bug — please report it. Pairs with `AppErrorCode` `internal`. */
  Internal: 10,
  /** Service is responsive but temporarily unable to serve. Pairs with `AppErrorCode` `unavailable`. */
  Unavailable: 11,
  /** Quota, storage, or plan limit exhausted. Pairs with `AppErrorCode` `quota`. */
  Quota: 12,
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
  Unavailable: "unavailable",
  Quota: "quota",
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
  AppErrorCodeByExitName.Unavailable,
  AppErrorCodeByExitName.Quota,
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
  unavailable: ExitCode.Unavailable,
  quota: ExitCode.Quota,
};

export const exitCodeFor = (code: AppErrorCode): ExitCode => ExitCodeByAppErrorCode[code];

export type AppErrorMetadata = {
  readonly response?: {
    readonly status: number;
    readonly body: unknown;
  };
};

const DefaultTitleByAppErrorCode: Readonly<Record<AppErrorCode, string>> = {
  auth: "Unauthorized",
  forbidden: "Forbidden",
  not_found: "Not Found",
  conflict: "Conflict",
  rate_limit: "Too Many Requests",
  validation: "Invalid Request",
  network: "Network Error",
  unavailable: "Service Unavailable",
  quota: "Quota Exceeded",
  internal: "Internal Error",
  usage: "Usage Error",
  issues: "Issues Found",
};

const DefaultDetailByAppErrorCode: Readonly<Record<AppErrorCode, string>> = {
  auth: "Credentials are missing, expired, or invalid.",
  forbidden: "You do not have permission to perform this operation.",
  not_found: "The requested resource was not found.",
  conflict: "The request conflicts with the current state.",
  rate_limit: "The request was rate limited.",
  validation: "The request is invalid.",
  network: "The remote service could not be reached.",
  unavailable: "The service is temporarily unavailable.",
  quota: "A quota, storage, or plan limit has been exhausted.",
  internal: "An internal error occurred.",
  usage: "The command invocation is invalid.",
  issues: "The command found issues.",
};

export const defaultTitleFor = (code: AppErrorCode): string => DefaultTitleByAppErrorCode[code];

export const defaultDetailFor = (code: AppErrorCode): string => DefaultDetailByAppErrorCode[code];

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly metadata?: AppErrorMetadata;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: AppErrorCode;
  readonly title?: string;
  readonly detail?: string;
  readonly metadata?: AppErrorMetadata;
  readonly recover?: string;
  readonly cmd?: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}): AppError => {
  const recover =
    args.recover === undefined
      ? []
      : [
          {
            description: args.recover,
            ...(args.cmd !== undefined ? { cmd: args.cmd } : {}),
          },
        ];
  const breadcrumbs = [...recover, ...(args.breadcrumbs ?? [])];

  return new AppError({
    code: args.code,
    title: args.title ?? defaultTitleFor(args.code),
    detail: args.detail ?? defaultDetailFor(args.code),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    ...(breadcrumbs.length > 0 ? { breadcrumbs } : {}),
    cause: args.cause,
  });
};
