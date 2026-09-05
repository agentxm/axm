/**
 * Conversions from the registry-client typed failure families into CLI-facing
 * `AppError` values. Each converter is a field copy: the categories use the
 * same strings as the application error codes, problem-details display data
 * and request/response/requestPolicy metadata carry over verbatim, and
 * per-category default titles and details apply exactly where the former
 * in-registry translation applied them. The byte-for-byte contract lives in
 * the golden-pair conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  REGISTRY_ERROR_CATEGORIES,
  type RegistryClientFailure,
  type RegistryOperationFailed,
  type RegistryProblem,
  type RegistryRequestFailed,
} from "@agentxm/registry-client";
import { makeAppError, type AppError, type AppErrorCode } from "../app-error.js";

// The registry category vocabulary and the CLI's AppErrorCode must stay the
// same strings; divergence is a compile error here, at the boundary that owns
// the mapping.
REGISTRY_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/** A problem-details response: registry-supplied display data over defaults. */
export const registryProblemToAppError = (error: RegistryProblem): AppError =>
  makeAppError({
    code: error.category,
    ...(error.title === undefined ? {} : { title: error.title }),
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    metadata: error.metadata,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

/** A request that failed without a problem document. */
export const registryRequestFailedToAppError = (error: RegistryRequestFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

/** An operational registry failure outside request transport. */
export const registryOperationFailedToAppError = (error: RegistryOperationFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

/** Convert any registry-client failure into the CLI-facing envelope. */
export const registryFailureToAppError = (error: RegistryClientFailure): AppError => {
  switch (error._tag) {
    case "RegistryProblem":
      return registryProblemToAppError(error);
    case "RegistryRequestFailed":
      return registryRequestFailedToAppError(error);
    case "RegistryOperationFailed":
      return registryOperationFailedToAppError(error);
  }
};
