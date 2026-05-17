import * as Effect from "effect/Effect";
import type { AppError } from "../app-error/index.js";

const LOCKFILE_READ_FAILURE_DETAIL = "Failed to read workspace lockfile";

export const isMalformedWorkspaceLockfileRead = (error: AppError): boolean =>
  error.code === "validation" && error.detail === LOCKFILE_READ_FAILURE_DETAIL;

export const ignoreMalformedWorkspaceLockfileRead = <R>(
  effect: Effect.Effect<void, AppError, R>,
): Effect.Effect<void, AppError, R> =>
  effect.pipe(Effect.catchIf(isMalformedWorkspaceLockfileRead, () => Effect.void));
