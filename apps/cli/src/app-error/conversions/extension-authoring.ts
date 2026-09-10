/**
 * Conversions from the extension-authoring typed failure family into CLI-facing
 * `AppError` values. Each converter reproduces the detail template its
 * construction sites rendered before decoupling — the byte-for-byte contract
 * for this family lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "@agentxm/extension-authoring";
import { makeAppError, type AppError } from "../app-error.js";

export const createNameConfiguredToAppError = (error: CreateNameConfigured): AppError =>
  makeAppError({
    code: "conflict",
    detail: `${error.subject} '${error.name}' already exists in settings`,
    recover: `Choose a different name or remove the existing ${error.subject.toLowerCase()} first`,
  });

/** Translate a create-destination inspection failure. */
export const createDestinationInspectionFailedToAppError = (
  error: CreateDestinationInspectionFailed,
): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to inspect create destination: ${error.path}`,
    cause: error.cause,
  });

/** Translate a path-safety violation. */
export const forkPackageInvalidToAppError = (error: ForkPackageInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a fork conflict; the site owns the fact sentence. */
export const forkPackageConflictToAppError = (error: ForkPackageConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.detail });

/** Translate a fork filesystem failure; the site owns the fact sentence. */
export const forkPackageFailedToAppError = (error: ForkPackageFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate an unsupported native-import type. */
export const nativeImportUnsupportedToAppError = (error: NativeImportUnsupported): AppError =>
  makeAppError({
    code: "usage",
    detail: `Native package import is not supported for ${error.type}`,
  });

/** Translate a native-import validation failure; the site owns the fact sentence. */
export const nativeImportInvalidToAppError = (error: NativeImportInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a native-import target collision. */
export const nativeImportConflictToAppError = (error: NativeImportConflict): AppError =>
  makeAppError({ code: "conflict", detail: `Import target already exists: ${error.targetDir}` });

/** Translate a native-import filesystem failure; the site owns the fact sentence. */
export const nativeImportFailedToAppError = (error: NativeImportFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a refused source-authority transition with its recovery facts. */
