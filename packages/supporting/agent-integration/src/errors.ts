/**
 * Failure vocabulary for the agent-integration layer: agent detection plus the
 * native-format readers, writers, and config editors.
 *
 * Fields are domain facts; the application boundary owns the mapping into
 * the CLI-facing error envelope.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import { NativeWriteRefused } from "./native-write-authority.js";
import { TransientBackupFailed } from "./transient-backup.js";

/**
 * Filesystem evidence gathering for agent detection failed. `detail` is the
 * fact sentence naming what was being detected; `cause` retains the
 * originating platform failure.
 */
export class AgentDetectionFailed extends Data.TaggedError("AgentDetectionFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/**
 * An agent MCP configuration file or target did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class McpConfigInvalid extends Data.TaggedError("McpConfigInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** An MCP config filesystem step failed; `detail` carries the site's fact sentence. */
export class McpConfigIoFailed extends Data.TaggedError("McpConfigIoFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** The named server entry exists but is not AXM-managed; AXM will not touch it. */
export class McpEntryUnmanaged extends Data.TaggedError("McpEntryUnmanaged")<{
  readonly serverName: string;
  readonly configPath: string;
}> {}

/** The server's AXM ownership markers cannot be reconciled. */
export class McpOwnershipMarkerInvalid extends Data.TaggedError("McpOwnershipMarkerInvalid")<{
  readonly serverName: string;
  readonly state: "malformed" | "unsupported-version";
  readonly operation: "modify" | "inspect";
}> {}

/**
 * An MCP definition, resolution, or install input did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class McpDefinitionInvalid extends Data.TaggedError("McpDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Member agents disagree about the shared MCP target. */
export class McpSharedTargetConflict extends Data.TaggedError("McpSharedTargetConflict")<{
  readonly reason: string;
}> {}

/** An agent hooks configuration file did not parse or validate. */
export class HookConfigInvalid extends Data.TaggedError("HookConfigInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A hook filesystem step failed; `detail` carries the site's fact sentence. */
export class HookIoFailed extends Data.TaggedError("HookIoFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** A subagent filesystem step failed; `detail` carries the site's fact sentence. */
export class SubagentIoFailed extends Data.TaggedError("SubagentIoFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/**
 * A native-format write failed after its pre-write backup was taken; the
 * original content survives at `backupPath`.
 */
export class WriteBackupRetained extends Data.TaggedError("WriteBackupRetained")<{
  readonly backupPath: string;
  readonly failure: NativeFormatFailure;
}> {}

/** Every typed failure the native-format readers, writers, and editors construct. */
export type NativeFormatFailure =
  | McpConfigInvalid
  | McpConfigIoFailed
  | McpEntryUnmanaged
  | McpOwnershipMarkerInvalid
  | McpDefinitionInvalid
  | McpSharedTargetConflict
  | HookConfigInvalid
  | HookIoFailed
  | SubagentIoFailed
  | TransientBackupFailed
  | NativeWriteRefused
  | WriteBackupRetained;

/** Every failure a `CodingAgent` member may surface. */
export type CodingAgentFailure = NativeFormatFailure;

/** Every typed failure the agent-integration modules construct. */
export type AgentIntegrationError = AgentDetectionFailed | NativeFormatFailure;
