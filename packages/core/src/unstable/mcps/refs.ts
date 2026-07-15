/**
 * Concrete MCP server extension ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  McpServerExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "../extensions/ref-base.js";
import type {
  GitBasedSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete MCP Server Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedMcpServerRef = McpServerExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryMcpServerRef = McpServerExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalMcpServerRef = McpServerExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type WorkspaceMcpServerRef = McpServerExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type McpServerExtensionRef =
  GitHostedMcpServerRef | RegistryMcpServerRef | LocalMcpServerRef | WorkspaceMcpServerRef;
