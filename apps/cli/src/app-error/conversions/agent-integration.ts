/**
 * Conversions from the agent-integration typed failure families into
 * CLI-facing `AppError` values. Each converter reproduces the detail template
 * its construction sites rendered before decoupling — the byte-for-byte
 * contract for these families lives in the table-driven conversion tests.
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
  TransientBackupFailed,
} from "@agentxm/agent-integration";
import { makeAppError, type AppError } from "../app-error.js";

/** Detection evidence gathering failed: an internal error carrying the facts. */
export const agentDetectionFailedToAppError = (error: AgentDetectionFailed): AppError =>
  makeAppError({
    code: "internal",
    detail: error.detail,
    cause: error.cause,
  });

export const hookConfigInvalidToAppError = (error: HookConfigInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a hook filesystem failure; the site owns the fact sentence. */
export const hookIoFailedToAppError = (error: HookIoFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate missing hook install state, reproducing each kind's detail. */
export const transientBackupFailedToAppError = (error: TransientBackupFailed): AppError => {
  const detail = (): string => {
    switch (error.step) {
      case "create-temp-dir":
        return `Failed to create temporary directory for backup of ${error.path}`;
      case "write-backup":
        return `Failed to write backup: ${error.path}`;
      case "remove-backup":
        return `Failed to remove temporary backup after successful write: ${error.path}`;
    }
  };
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate an invalid subagent definition; the site owns the fact sentence. */
export const subagentIoFailedToAppError = (error: SubagentIoFailed): AppError =>
  makeAppError({
    code: "internal",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate missing subagent install state, reproducing each kind's detail. */
export const mcpConfigInvalidToAppError = (error: McpConfigInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate an MCP filesystem failure; the site owns the fact sentence. */
export const mcpConfigIoFailedToAppError = (error: McpConfigIoFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a refusal to touch an unmanaged MCP entry. */
export const mcpEntryUnmanagedToAppError = (error: McpEntryUnmanaged): AppError =>
  makeAppError({
    code: "conflict",
    detail: `MCP server ${error.serverName} is unmanaged in ${error.configPath}; AXM will not remove it`,
  });

/** Translate irreconcilable AXM ownership markers per state and operation. */
export const mcpOwnershipMarkerInvalidToAppError = (error: McpOwnershipMarkerInvalid): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      error.state === "unsupported-version"
        ? `MCP server ${error.serverName} uses a newer AXM ownership marker; upgrade AXM before ${
            error.operation === "modify" ? "modifying" : "inspecting"
          } it`
        : `MCP server ${error.serverName} has malformed AXM ownership markers`,
  });

/** Translate an invalid MCP definition; the site owns the fact sentence. */
export const mcpDefinitionInvalidToAppError = (error: McpDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a non-registry MCP install with the canonical registry suggestion. */
export const mcpSharedTargetConflictToAppError = (error: McpSharedTargetConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.reason });

/** Translate an invalid skill definition; the site owns the fact sentence. */
