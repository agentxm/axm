import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import type { SuggestedAction } from "../cli-runtime/suggested-action.js";

/**
 * Named exit codes for the CLI. `Success` is the only exit code without an
 * `AppErrorCode` counterpart; the rest map 1:1 with `AppErrorCode` via
 * `exitCodeFor`.
 *
 * Reserved ranges:
 * - `0` — success
 * - `1`–`16` — AXM application errors (this enum)
 * - `17`–`127` — reserved for future AXM application errors; do not reuse
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
  /** Progress is waiting on a person to complete an action. Pairs with `AppErrorCode` `auth_required`. */
  AuthRequired: 13,
  /** A pending authentication flow expired. Pairs with `AppErrorCode` `auth_expired`. */
  AuthExpired: 14,
  /** A person denied or cancelled a pending authentication flow. Pairs with `AppErrorCode` `auth_denied`. */
  AuthDenied: 15,
  /** A bounded operation did not complete before its caller-selected deadline. Pairs with `AppErrorCode` `timeout`. */
  Timeout: 16,
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
  AuthRequired: "auth_required",
  AuthExpired: "auth_expired",
  AuthDenied: "auth_denied",
  Timeout: "timeout",
} as const satisfies Record<ErrorExitName, string>;

export type AppErrorCode = (typeof AppErrorCodeByExitName)[ErrorExitName];
export type AppErrorClass = "internal" | "user" | "external";

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
  AppErrorCodeByExitName.AuthRequired,
  AppErrorCodeByExitName.AuthExpired,
  AppErrorCodeByExitName.AuthDenied,
  AppErrorCodeByExitName.Timeout,
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
  auth_required: ExitCode.AuthRequired,
  auth_expired: ExitCode.AuthExpired,
  auth_denied: ExitCode.AuthDenied,
  timeout: ExitCode.Timeout,
};

export const exitCodeFor = (code: AppErrorCode): ExitCode => ExitCodeByAppErrorCode[code];

export type AppErrorMetadata = {
  readonly request?: {
    readonly service: string;
    readonly method?: string;
    readonly url: string;
  };
  readonly response?: {
    readonly status: number;
    readonly requestId?: string;
    readonly problemCode?: string;
    readonly body?: unknown;
  };
};

export type AppErrorAction = {
  readonly kind: "open-url";
  readonly url: string;
  readonly code?: string;
  readonly expiresAt?: string;
  readonly resume?: string;
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
  auth_required: "Authentication Required",
  auth_expired: "Authentication Expired",
  auth_denied: "Authentication Denied",
  timeout: "Timed Out",
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
  auth_required: "Authentication requires approval from a person.",
  auth_expired: "The pending authentication flow expired.",
  auth_denied: "The pending authentication flow was denied or cancelled.",
  timeout: "The operation did not complete before the deadline.",
};

export const defaultTitleFor = (code: AppErrorCode): string => DefaultTitleByAppErrorCode[code];

export const defaultDetailFor = (code: AppErrorCode): string => DefaultDetailByAppErrorCode[code];

/**
 * Baseline suggested next actions per error category, used when a caller
 * attaches no error-specific suggestions of its own. Codes without a sensible
 * generic follow-up map to an empty list.
 */
const DefaultSuggestionsByAppErrorCode: Readonly<
  Record<AppErrorCode, ReadonlyArray<SuggestedAction>>
> = {
  internal: [
    {
      description:
        "This looks like a bug. Please report it, including the request ID if one is shown.",
      url: "https://github.com/agentxm/axm/issues",
    },
  ],
  network: [{ description: "Check your network connection and the registry URL, then retry." }],
  unavailable: [{ description: "The service is temporarily unavailable. Retry in a few moments." }],
  auth: [],
  forbidden: [],
  not_found: [],
  conflict: [],
  rate_limit: [],
  validation: [],
  usage: [],
  issues: [],
  quota: [],
  auth_required: [],
  auth_expired: [],
  auth_denied: [],
  timeout: [],
};

/** Baseline suggested next actions for an error category. */
export const defaultSuggestionsFor = (code: AppErrorCode): ReadonlyArray<SuggestedAction> =>
  DefaultSuggestionsByAppErrorCode[code];

const AppErrorClassByAppErrorCode: Readonly<Record<AppErrorCode, AppErrorClass>> = {
  internal: "internal",
  network: "external",
  unavailable: "external",
  rate_limit: "external",
  quota: "external",
  auth: "user",
  forbidden: "user",
  not_found: "user",
  conflict: "user",
  validation: "user",
  usage: "user",
  issues: "user",
  auth_required: "user",
  auth_expired: "user",
  auth_denied: "user",
  timeout: "external",
};

export const errorClassForAppErrorCode = (code: AppErrorCode): AppErrorClass =>
  AppErrorClassByAppErrorCode[code];

/**
 * Resolve the suggestions to surface for an error: the caller's own
 * suggestions when present, otherwise the baseline set for the error code.
 * Used by both human (`renderAppError`) and JSON (`makeJsonErrorEnvelope`)
 * output so the two surfaces stay consistent.
 */
export const effectiveSuggestionsFor = (error: AppError): ReadonlyArray<SuggestedAction> =>
  error.suggestions !== undefined && error.suggestions.length > 0
    ? error.suggestions
    : defaultSuggestionsFor(error.code);

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly metadata?: AppErrorMetadata;
  readonly blockedOn?: "human";
  readonly action?: AppErrorAction;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: AppErrorCode;
  readonly title?: string;
  readonly detail?: string;
  readonly metadata?: AppErrorMetadata;
  readonly blockedOn?: "human";
  readonly action?: AppErrorAction;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
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
  const suggestions = [...recover, ...(args.suggestions ?? [])];

  return new AppError({
    code: args.code,
    title: args.title ?? defaultTitleFor(args.code),
    detail: args.detail ?? defaultDetailFor(args.code),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    ...(args.blockedOn !== undefined ? { blockedOn: args.blockedOn } : {}),
    ...(args.action !== undefined ? { action: args.action } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
    cause: args.cause,
  });
};
