/**
 * Typed failure family for the MCP server manager and inspection.
 *
 * The native-config failures the agent writers construct live in
 * `@agentxm/agent-integration`; this module owns what the manager itself
 * decides. Fields are domain facts; the application error boundary owns
 * rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
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

/** Every failure the MCP module surfaces. */
export type McpManagerError = McpInspectionError | McpRegistryOnlyInstall | McpInstallStateMissing;
