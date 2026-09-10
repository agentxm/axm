/**
 * Conversions from the workspace-state typed failure family into CLI-facing
 * `AppError` values. Each converter reproduces the detail template its
 * construction sites rendered before decoupling — the byte-for-byte contract
 * for this family lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { MaterializedTreeInvalid, PathTraversalDetected } from "@agentxm/workspace-state";
import { makeAppError, type AppError } from "../app-error.js";

export const pathTraversalDetectedToAppError = (error: PathTraversalDetected): AppError =>
  makeAppError({ code: "internal", detail: `Path traversal detected: ${error.path}` });

/** Translate a fork validation failure; the site owns the fact sentence. */
export const materializedTreeInvalidToAppError = (error: MaterializedTreeInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid materialized package tree at ${error.root}: ${error.reason}`,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate an incompletely enumerable desired-state graph. */
