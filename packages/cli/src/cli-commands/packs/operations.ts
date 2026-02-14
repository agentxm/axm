/**
 * Pack operation types and references.
 *
 * Shared across pack operations (install, uninstall, publish).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Operation } from "../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Install Pack
// -----------------------------------------------------------------------------

/**
 * Args for the install-pack operation.
 */
export interface InstallPackOperationArgs {
  /** Pack name (e.g., "my-pack") */
  readonly packName: string;
  /** Pack scope (e.g., "@acme") */
  readonly scope: string;
  /** Exact resolved version */
  readonly resolvedVersion: string;
  /** Content hash */
  readonly checksum: string;
  /** Registry source name */
  readonly sourceName: string;
  /** Resolved skill FQNs to exact versions */
  readonly resolvedSkills: Readonly<Record<string, string>>;
  /** Resolved command FQNs to exact versions */
  readonly resolvedCommands: Readonly<Record<string, string>>;
  /** Resolved MCP server FQNs to exact versions */
  readonly resolvedMcpServers: Readonly<Record<string, string>>;
}

/**
 * Add a pack to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallPackOperation = Operation<"install-pack", InstallPackOperationArgs>;

// -----------------------------------------------------------------------------
// Uninstall Pack
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-pack operation.
 */
export interface UninstallPackOperationArgs {
  /** Pack name to uninstall */
  readonly packName: string;
}

/**
 * Remove a pack from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallPackOperation = Operation<"uninstall-pack", UninstallPackOperationArgs>;

// -----------------------------------------------------------------------------
// Publish Pack
// -----------------------------------------------------------------------------

/**
 * Args for the publish-pack operation.
 */
export interface PublishPackOperationArgs {
  /** Extension identity in `@scope/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g., "local"). */
  readonly registryName: string;
}

/**
 * Publish a pack to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishPackOperation = Operation<"publish-pack", PublishPackOperationArgs>;
