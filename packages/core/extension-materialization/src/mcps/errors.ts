/**
 * Typed failure family for the MCP server manager, the MCP install operation,
 * and MCP inspection.
 *
 * The native-config failures the agent writers construct live in
 * `@agentxm/agent-integration`; this module owns what materialization itself
 * decides. Fields are domain facts; the application error boundary owns
 * rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { McpInspectionError } from "@agentxm/workspace-projection";

/** MCP servers install only from registry packages. */
export class McpRegistryOnlyInstall extends Data.TaggedError("McpRegistryOnlyInstall")<{
  readonly serverName: string;
  readonly refType: string;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class McpInstallStateMissing extends Data.TaggedError("McpInstallStateMissing")<{
  readonly name: string;
}> {}

/**
 * The requested local connection name already stands for a different source,
 * so accepting the request would silently repoint an installed connection.
 */
export class McpLocalNameConflict extends Data.TaggedError("McpLocalNameConflict")<{
  readonly localName: string;
  /** Source identity the request would install. */
  readonly requestedIdentity: string;
  /** Source identity the name already stands for, or `inline` for an authored entry. */
  readonly owningIdentity: string;
}> {}

/** The canonical path a registry MCP package would occupy escapes the workspace. */
export class McpCanonicalPathUnsafe extends Data.TaggedError("McpCanonicalPathUnsafe")<{
  readonly serverName: string;
  readonly canonicalPath: string;
}> {}

/** Why a workspace-authored MCP package cannot be installed from where it says it is. */
export type McpWorkspacePackageFault = "outside-workspace" | "missing" | "unreadable";

/** A workspace-sourced MCP package is not where the reference says it is. */
export class McpWorkspacePackageInvalid extends Data.TaggedError("McpWorkspacePackageInvalid")<{
  readonly serverName: string;
  readonly location: string;
  readonly fault: McpWorkspacePackageFault;
  readonly cause?: unknown;
}> {}

/**
 * The manifest declares required inputs nothing supplied, and the invoking
 * surface said it cannot prompt.
 */
export class McpRequiredInputsMissing extends Data.TaggedError("McpRequiredInputsMissing")<{
  readonly localName: string;
  /** Input names still unsatisfied, sorted. */
  readonly inputNames: ReadonlyArray<string>;
}> {}

/** Why projecting an MCP connection to the configured agents was refused. */
export type McpAgentSyncFault =
  /** Settings name agents AXM does not know, and the caller asked for strict sync. */
  | "unknown-agents"
  /** An agent's native configuration cannot represent the connection. */
  | "misconfigured"
  /** An agent write failed and the caller asked for strict sync. */
  | "failed"
  /** An agent AXM requires refused the connection and the caller asked for strict sync. */
  | "disabled";

/** Projecting an MCP connection into the configured agents could not settle. */
export class McpAgentSyncRefused extends Data.TaggedError("McpAgentSyncRefused")<{
  readonly serverName: string;
  readonly fault: McpAgentSyncFault;
  /** The agents the fault is about; empty when it is about none in particular. */
  readonly agentIds: ReadonlyArray<AgentId | string>;
}> {}

/** Every failure the MCP module surfaces. */
export type McpManagerError =
  | McpInspectionError
  | McpRegistryOnlyInstall
  | McpInstallStateMissing
  | McpLocalNameConflict
  | McpCanonicalPathUnsafe
  | McpWorkspacePackageInvalid
  | McpRequiredInputsMissing
  | McpAgentSyncRefused;
