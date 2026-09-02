/**
 * Conversions from the agent-integration typed failure family into CLI-facing
 * `AppError` values. Each converter reproduces the detail its construction
 * sites rendered before decoupling.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AgentDetectionFailed } from "@agentxm/agent-integration";
import { makeAppError, type AppError } from "../app-error.js";

/** Detection evidence gathering failed: an internal error carrying the facts. */
export const agentDetectionFailedToAppError = (error: AgentDetectionFailed): AppError =>
  makeAppError({
    code: "internal",
    detail: error.detail,
    cause: error.cause,
  });
