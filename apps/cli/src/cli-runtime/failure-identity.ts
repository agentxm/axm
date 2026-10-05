/**
 * Safe diagnostic identity for a terminal failure.
 *
 * A failure report names its failure only from sets the CLI can enumerate:
 * an application error's problem or code, a typed failure's tag, a defect's
 * built-in error kind or tag. Nothing here reads a detail, message, metadata,
 * cause text, argument, or path, so none of them can reach a report.
 */
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { CliError } from "effect/cli";

import { AppError, type AppErrorCode } from "../app-error/index.js";
import { isWorkspaceFailure } from "../app-error/failure-catalog.js";
import { failureToAppError, toAppError } from "../app-error/conversions.js";
import { OutputWriteFailed } from "../screen/streams.js";
import type { TelemetryFailurePhase } from "../telemetry/index.js";

export interface FailureIdentity {
  /** Stable diagnostic identifier; `unknown` when no enumerable one applies. */
  readonly kind: string;
  readonly code: AppErrorCode;
  /** False for a defect. */
  readonly handled: boolean;
}

export interface TerminalFailure extends FailureIdentity {
  readonly phase: TelemetryFailurePhase;
}

const KIND_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/u;
const KIND_MAX_LENGTH = 64;
const TAG_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;
const TAG_MAX_LENGTH = 48;
const UNKNOWN_KIND = "unknown";

const boundedKind = (candidate: string): string =>
  candidate.length <= KIND_MAX_LENGTH && KIND_PATTERN.test(candidate) ? candidate : UNKNOWN_KIND;

const kebabCase = (identifier: string): string =>
  identifier
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .toLowerCase();

/** A code-defined tag, or nothing when the value carries none a report may hold. */
const safeTag = (value: unknown): string | undefined => {
  try {
    if (typeof value !== "object" || value === null || !("_tag" in value)) return undefined;
    const tag = value._tag;
    return typeof tag === "string" && tag.length <= TAG_MAX_LENGTH && TAG_PATTERN.test(tag)
      ? kebabCase(tag)
      : undefined;
  } catch {
    return undefined;
  }
};

// Most specific first: every built-in error is also an `Error`.
const builtInErrorKinds: ReadonlyArray<readonly [string, new (...args: never[]) => Error]> = [
  ["aggregate-error", AggregateError],
  ["eval-error", EvalError],
  ["range-error", RangeError],
  ["reference-error", ReferenceError],
  ["syntax-error", SyntaxError],
  ["type-error", TypeError],
  ["uri-error", URIError],
  ["error", Error],
];

const builtInErrorKind = (value: unknown): string | undefined =>
  builtInErrorKinds.find(([, constructor]) => value instanceof constructor)?.[0];

const cliErrorKind = (error: CliError.CliError): string | undefined =>
  error._tag === "ShowHelp" ? safeTag(error.errors[0]) : safeTag(error);

/** Identity of an expected failure the CLI handled and rendered. */
export const handledFailureIdentity = (failure: unknown): FailureIdentity => {
  if (failure instanceof AppError) {
    return {
      kind: boundedKind(failure.problem?.code ?? failure.code),
      code: failure.code,
      handled: true,
    };
  }
  if (isWorkspaceFailure(failure)) {
    return {
      kind: boundedKind(safeTag(failure) ?? UNKNOWN_KIND),
      code: toAppError(failure).code,
      handled: true,
    };
  }
  if (failure instanceof OutputWriteFailed) {
    return { kind: "output-write-failed", code: "internal", handled: true };
  }
  if (CliError.isCliError(failure)) {
    return {
      kind: boundedKind(cliErrorKind(failure) ?? UNKNOWN_KIND),
      code: "usage",
      handled: true,
    };
  }
  return { kind: UNKNOWN_KIND, code: failureToAppError(failure).code, handled: true };
};

/** Identity of an unexpected defect: its tag, else its built-in error kind. */
export const defectIdentity = (defect: unknown): FailureIdentity => ({
  kind: boundedKind(`defect.${safeTag(defect) ?? builtInErrorKind(defect) ?? UNKNOWN_KIND}`),
  code: failureToAppError(defect).code,
  handled: false,
});

/** The defect a cause carries: its first die, else what the cause squashes to. */
export const causeDefect = (cause: Cause.Cause<unknown>): unknown => {
  const defect = Cause.findDefect(cause);
  return Result.isSuccess(defect) ? defect.success : Cause.squash(cause);
};

/** Whether any failure or defect in the cause is an output write failure. */
export const causeCarriesOutputFailure = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some(
    (reason) =>
      (Cause.isFailReason(reason) && reason.error instanceof OutputWriteFailed) ||
      (Cause.isDieReason(reason) && reason.defect instanceof OutputWriteFailed),
  );

/**
 * The terminal failure a cause ends an invocation with outside every runtime
 * envelope: none for a cancellation or a help request that exits successfully.
 * An output failure settles in the output phase. Anything else settles in
 * `phase`: startup for a failure that escaped before any command ran — a
 * workspace failure there is one of configuration — or the command phase for
 * a command that runs without the envelope.
 */
export const processTerminalFailure = (
  cause: Cause.Cause<unknown>,
  phase: "bootstrap" | "command" = "bootstrap",
): Option.Option<TerminalFailure> => {
  if (Cause.hasInterruptsOnly(cause)) return Option.none();
  if (Cause.hasDies(cause)) {
    return Option.some({
      ...defectIdentity(causeDefect(cause)),
      phase: causeCarriesOutputFailure(cause) ? "output" : phase,
    });
  }
  const failure = Cause.squash(cause);
  if (CliError.isCliError(failure) && failure._tag === "ShowHelp" && failure.errors.length === 0) {
    return Option.none();
  }
  return Option.some({
    ...handledFailureIdentity(failure),
    phase:
      failure instanceof OutputWriteFailed
        ? "output"
        : phase === "bootstrap" && isWorkspaceFailure(failure)
          ? "configuration"
          : phase,
  });
};
