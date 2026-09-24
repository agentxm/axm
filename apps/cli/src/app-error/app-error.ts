import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  defaultFailureDetail,
  type FailureAction,
  type FailureInput,
  type FailureMetadata,
  type FailureProblem,
  type FailureSuggestedAction,
} from "@agentxm/workspace/transitions/planning";

/**
 * Named exit codes for the CLI. `Success` is the only exit code without an
 * `AppErrorCode` counterpart; the rest map 1:1 with `AppErrorCode` via
 * `exitCodeFor`.
 *
 * Reserved ranges:
 * - `0` — success
 * - `1`–`16` — AXM application errors (this enum)
 * - `17`–`127` — reserved for future AXM application errors; do not reuse
 * - `128`+ — POSIX signal convention (130 SIGINT, 143 SIGTERM); set by the
 *   runtime's signal handlers and the operation exit mapping, not by
 *   `AppError`
 *
 * The numeric values diverge from `sysexits.h` deliberately: AXM uses a
 * flat 1–N scheme so the `code` field in JSON output stays the agent-facing
 * discriminator rather than the number.
 *
 * `ExitCodeDefinitions` below holds the one public meaning of every code,
 * including the signal codes; the help topic at
 * `apps/cli/help/topics/exit-codes.md` is pinned to it by
 * `cli/exit-codes-match-published-reference`. Each member here names only the
 * `AppErrorCode` it pairs with.
 */
export const ExitCode = {
  /** Pairs with no `AppErrorCode`. */
  Success: 0,
  /** Pairs with `AppErrorCode` `issues`. */
  Issues: 1,
  /** Pairs with `AppErrorCode` `usage`. */
  Usage: 2,
  /** Pairs with `AppErrorCode` `not_found`. */
  NotFound: 3,
  /** Pairs with `AppErrorCode` `auth`. */
  Auth: 4,
  /** Pairs with `AppErrorCode` `forbidden`. */
  Forbidden: 5,
  /** Pairs with `AppErrorCode` `conflict`. */
  Conflict: 6,
  /** Pairs with `AppErrorCode` `rate_limit`. */
  RateLimit: 7,
  /** Pairs with `AppErrorCode` `network`. */
  Network: 8,
  /** Pairs with `AppErrorCode` `validation`. */
  Validation: 9,
  /** Pairs with `AppErrorCode` `internal`. */
  Internal: 10,
  /** Pairs with `AppErrorCode` `unavailable`. */
  Unavailable: 11,
  /** Pairs with `AppErrorCode` `quota`. */
  Quota: 12,
  /** Pairs with `AppErrorCode` `auth_required`. */
  AuthRequired: 13,
  /** Pairs with `AppErrorCode` `auth_expired`. */
  AuthExpired: 14,
  /** Pairs with `AppErrorCode` `auth_denied`. */
  AuthDenied: 15,
  /** Pairs with `AppErrorCode` `timeout`. */
  Timeout: 16,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Canonical public meaning of every AXM process exit code. */
export const ExitCodeDefinitions = [
  {
    code: ExitCode.Success,
    meaning: "Success. Also used for help output and cancelled prompts.",
  },
  {
    code: ExitCode.Issues,
    meaning:
      'Command ran successfully but reported problems requiring attention (e.g., `axm lint` findings, doctor-style checks). Not lint-only — any "ran but found problems" outcome belongs here.',
  },
  {
    code: ExitCode.Usage,
    meaning:
      "Invalid invocation, confirmable approval required when no prompt can open, or a named policy override is required. Fix the invocation or use the reported recovery action.",
  },
  { code: ExitCode.NotFound, meaning: "Resource doesn't exist or isn't visible." },
  {
    code: ExitCode.Auth,
    meaning: "Credentials were rejected, are invalid, or expired. Sign in again.",
  },
  {
    code: ExitCode.Forbidden,
    meaning: "Signed in, but not authorized for this action.",
  },
  {
    code: ExitCode.Conflict,
    meaning:
      "Conflicts with current state, including a stale execution candidate (already exists, version mismatch, concurrent update). Reconcile and retry.",
  },
  { code: ExitCode.RateLimit, meaning: "Rate limited. Retry after a backoff." },
  {
    code: ExitCode.Network,
    meaning: "Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable.",
  },
  {
    code: ExitCode.Validation,
    meaning: "Input parsed but failed validation. Correct it and retry.",
  },
  {
    code: ExitCode.Internal,
    meaning: "Unexpected internal error. Likely a bug — please report it.",
  },
  {
    code: ExitCode.Unavailable,
    meaning: "Service is responsive but temporarily unable to serve.",
  },
  {
    code: ExitCode.Quota,
    meaning: "Quota, storage, or plan limit exhausted.",
  },
  {
    code: ExitCode.AuthRequired,
    meaning:
      "Authentication or authorization is waiting on a person to complete a required action.",
  },
  {
    code: ExitCode.AuthExpired,
    meaning: "A pending authentication flow expired.",
  },
  {
    code: ExitCode.AuthDenied,
    meaning: "A person denied or cancelled a pending authentication flow.",
  },
  {
    code: ExitCode.Timeout,
    meaning: "A bounded operation did not complete before its caller-selected deadline.",
  },
  {
    code: 130,
    meaning: "Interrupted by SIGINT. Local candidate-wide transactions roll back before AXM exits.",
  },
  {
    code: 143,
    meaning: "Terminated by SIGTERM. Local candidate-wide transactions roll back before AXM exits.",
  },
] as const;

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

/**
 * The `AppErrorCode` a non-zero application exit code pairs with, read from
 * the same 1:1 table; `undefined` for success and the signal codes.
 */
export const appErrorCodeForExit = (exitCode: number): AppErrorCode | undefined =>
  AppErrorCodes.find((code) => ExitCodeByAppErrorCode[code] === exitCode);

/** The pending action a failure hands to a person, as the kernel renders it. */
export type AppErrorAction = FailureAction;

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

export const defaultTitleFor = (code: AppErrorCode): string => DefaultTitleByAppErrorCode[code];

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
const defaultSuggestionsFor = (code: AppErrorCode): ReadonlyArray<SuggestedAction> =>
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
  readonly metadata?: FailureMetadata;
  readonly status?: "pending-human";
  readonly retryable?: boolean;
  readonly blockedOn?: "human";
  readonly action?: AppErrorAction;
  readonly problem?: FailureProblem;
  readonly inputs?: ReadonlyArray<FailureInput>;
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: AppErrorCode;
  readonly title?: string;
  readonly detail?: string;
  readonly metadata?: FailureMetadata;
  readonly status?: "pending-human";
  readonly retryable?: boolean;
  readonly blockedOn?: "human";
  readonly action?: AppErrorAction;
  readonly problem?: FailureProblem;
  readonly inputs?: ReadonlyArray<FailureInput>;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction>;
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
    detail: args.detail ?? defaultFailureDetail(args.code),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
    ...(args.blockedOn !== undefined ? { blockedOn: args.blockedOn } : {}),
    ...(args.action !== undefined ? { action: args.action } : {}),
    ...(args.problem !== undefined ? { problem: args.problem } : {}),
    ...(args.inputs !== undefined && args.inputs.length > 0 ? { inputs: args.inputs } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
    cause: args.cause,
  });
};
