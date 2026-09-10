/**
 * Failure vocabulary for the agent-integration layer.
 *
 * Fields are domain facts; the application boundary owns the mapping into
 * the CLI-facing error envelope.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * Filesystem evidence gathering for agent detection failed. `detail` is the
 * fact sentence naming what was being detected; `cause` retains the
 * originating platform failure.
 */
export class AgentDetectionFailed extends Data.TaggedError("AgentDetectionFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Every typed failure the agent-integration modules construct. */
export type AgentIntegrationError = AgentDetectionFailed;
