/**
 * Conversions from the extension-sources typed failure families into
 * CLI-facing `AppError` values. Each converter is a field copy: the carried
 * category (or the tag's fixed category) becomes the code, the resolution
 * site's sentence carries over verbatim, and `recover`/`cmd` reproduce the
 * former envelope sugar. The byte-for-byte contract lives in the
 * table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  SOURCE_ERROR_CATEGORIES,
  type AxmSkillGateUnavailable,
  type GitOperationFailed,
  type SourceError,
  type SourceHostNotConfigured,
  type SourceNetworkFailure,
  type SourceNotResolvable,
  type SourceSyntaxInvalid,
  type WorkspaceCatalogUnavailable,
} from "@agentxm/extension-sources";
import { makeAppError, type AppError, type AppErrorCode } from "../app-error.js";

// The source category vocabulary and the CLI's AppErrorCode must stay the
// same strings; divergence is a compile error here, at the boundary that owns
// the mapping.
SOURCE_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/** Input that does not parse as any source locator grammar. */
export const sourceSyntaxInvalidToAppError = (error: SourceSyntaxInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Valid input that no configured source host serves. */
export const sourceHostNotConfiguredToAppError = (error: SourceHostNotConfigured): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** A locator or identifier that did not resolve; the site owns category and wording. */
export const sourceNotResolvableToAppError = (error: SourceNotResolvable): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** A network-facing acquisition step failed. */
export const sourceNetworkFailureToAppError = (error: SourceNetworkFailure): AppError =>
  makeAppError({
    code: "network",
    detail: error.detail,
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** A git subprocess failure: clones are network, SHA reads are validation. */
export const gitOperationFailedToAppError = (error: GitOperationFailed): AppError =>
  makeAppError({
    code: error.operation === "clone" ? "network" : "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * A workspace catalog port failure: the Live chose category, wording, and
 * suggestions from the workspace failure it wrapped, so the envelope carries
 * them over 1:1.
 */
export const workspaceCatalogUnavailableToAppError = (
  error: WorkspaceCatalogUnavailable,
): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

/**
 * An official AXM skill gate port failure: the Live chose category, wording,
 * and suggestions, so the envelope carries them over 1:1.
 */
export const axmSkillGateUnavailableToAppError = (error: AxmSkillGateUnavailable): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

/** Convert any package-owned source failure into the CLI-facing envelope. */
export const sourceErrorToAppError = (error: SourceError): AppError => {
  switch (error._tag) {
    case "SourceSyntaxInvalid":
      return sourceSyntaxInvalidToAppError(error);
    case "SourceHostNotConfigured":
      return sourceHostNotConfiguredToAppError(error);
    case "SourceNotResolvable":
      return sourceNotResolvableToAppError(error);
    case "SourceNetworkFailure":
      return sourceNetworkFailureToAppError(error);
    case "GitOperationFailed":
      return gitOperationFailedToAppError(error);
  }
};
