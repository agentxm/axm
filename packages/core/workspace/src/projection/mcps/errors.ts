/**
 * Typed failure family for MCP projection facts.
 *
 * Reading a native MCP config and classifying what it holds fails only in the
 * ways the native writers already model, so this family is exactly the
 * agent-integration native-config vocabulary under one name. The failures a
 * manager decides for itself belong to the manager, not here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
} from "@agentxm/agent-integration";

/** Every failure MCP inspection and drift classification surface. */
export type McpInspectionError =
  | McpConfigInvalid
  | McpConfigIoFailed
  | McpEntryUnmanaged
  | McpOwnershipMarkerInvalid
  | McpDefinitionInvalid
  | McpSharedTargetConflict;
