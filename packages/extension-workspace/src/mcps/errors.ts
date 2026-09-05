/**
 * Typed failure family for the MCP server manager, config writer, and
 * inspection. Fields are domain facts; the application error boundary owns
 * rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

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

/** MCP servers install only from registry packages. */
export class McpRegistryOnlyInstall extends Data.TaggedError("McpRegistryOnlyInstall")<{
  readonly serverName: string;
  readonly refType: string;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class McpInstallStateMissing extends Data.TaggedError("McpInstallStateMissing")<{
  readonly name: string;
}> {}

/** Member agents disagree about the shared MCP target. */
export class McpSharedTargetConflict extends Data.TaggedError("McpSharedTargetConflict")<{
  readonly reason: string;
}> {}

/**
 * An MCP definition, resolution, or install input did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class McpDefinitionInvalid extends Data.TaggedError("McpDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Every failure the MCP module constructs. */
export type McpManagerError =
  | McpConfigInvalid
  | McpConfigIoFailed
  | McpEntryUnmanaged
  | McpOwnershipMarkerInvalid
  | McpDefinitionInvalid
  | McpRegistryOnlyInstall
  | McpInstallStateMissing
  | McpSharedTargetConflict;
