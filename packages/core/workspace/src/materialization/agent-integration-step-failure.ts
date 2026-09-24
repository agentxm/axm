/**
 * The rendering of the agent-integration failure family — native agent
 * configuration reads and writes, detection, and write safety — into the one
 * rendered failure a plan step settles with and the application boundary
 * projects.
 *
 * Agent adapters state facts and own no rendering, so the capability that
 * unions them into `ExtensionManagerFailure` renders them, exactly as it
 * renders shared projection.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  SubagentIoFailed,
} from "../projection/agent-adapters/errors.js";
import type { NativeWriteRefused } from "../projection/agent-adapters/native-write-authority.js";
import type { TransientBackupFailed } from "../projection/agent-adapters/transient-backup.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";

/** Every agent-integration failure, beside a retained write backup that wraps one. */
export type AgentIntegrationFailure =
  | AgentDetectionFailed
  | HookConfigInvalid
  | HookIoFailed
  | TransientBackupFailed
  | SubagentIoFailed
  | McpConfigInvalid
  | McpConfigIoFailed
  | McpEntryUnmanaged
  | McpOwnershipMarkerInvalid
  | McpDefinitionInvalid
  | McpSharedTargetConflict
  | NativeWriteRefused;

const transientBackupDetail = (error: TransientBackupFailed): string => {
  switch (error.step) {
    case "create-temp-dir":
      return `Failed to create temporary directory for backup of ${error.path}`;
    case "write-backup":
      return `Failed to write backup: ${error.path}`;
    case "remove-backup":
      return `Failed to remove temporary backup after successful write: ${error.path}`;
  }
};

/** Translate one agent-integration failure. */
export const agentIntegrationFailureToStepFailure = (
  error: AgentIntegrationFailure,
): StepFailure => {
  switch (error._tag) {
    case "AgentDetectionFailed":
    case "HookIoFailed":
    case "SubagentIoFailed":
    case "McpConfigIoFailed":
      return makeStepFailure({ category: "internal", detail: error.detail, cause: error.cause });
    case "HookConfigInvalid":
    case "McpConfigInvalid":
    case "McpDefinitionInvalid":
      return makeStepFailure({ category: "validation", detail: error.detail, cause: error.cause });
    case "TransientBackupFailed":
      return makeStepFailure({
        category: "internal",
        detail: transientBackupDetail(error),
        cause: error.cause,
      });
    case "McpEntryUnmanaged":
      return makeStepFailure({
        category: "conflict",
        detail: `MCP server ${error.serverName} is unmanaged in ${error.configPath}; AXM will not remove it`,
      });
    case "McpOwnershipMarkerInvalid":
      return makeStepFailure({
        category: "conflict",
        detail:
          error.state === "unsupported-version"
            ? `MCP server ${error.serverName} uses a newer AXM ownership marker; upgrade AXM before ${
                error.operation === "modify" ? "modifying" : "inspecting"
              } it`
            : `MCP server ${error.serverName} has malformed AXM ownership markers`,
      });
    case "McpSharedTargetConflict":
      return makeStepFailure({
        category: "conflict",
        detail: error.reason,
        suggestions: [
          {
            description:
              "Use an MCP package whose transport and symbolic inputs are supported by every configured reader of the shared target.",
          },
        ],
        cause: error,
      });
    case "NativeWriteRefused":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to snapshot native write target ${error.path}`,
        cause: error.cause,
      });
  }
};
