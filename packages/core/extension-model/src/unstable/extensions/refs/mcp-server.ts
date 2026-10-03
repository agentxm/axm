/**
 * Concrete MCP server extension ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";
import type { Handle } from "../handle.js";

/** Selects one unchanged plugin configuration entry independently from its package. */
export const NativeMcpComponentSchema = Schema.Struct({
  format: Schema.Literal("agent-plugins"),
  configPath: Schema.NonEmptyString.check(
    Schema.makeFilter((value) =>
      /^[A-Za-z]:/u.test(value) ||
      value.startsWith("/") ||
      value.includes("\\") ||
      value.split("/").some((part) => part === "" || part === "..")
        ? "Expected a package-relative MCP configuration path"
        : undefined,
    ),
  ),
  name: Schema.NonEmptyString,
});
export type NativeMcpComponent = typeof NativeMcpComponentSchema.Type;

type ExternalMcpRefDetails<T extends GitHostedRefDetails | LocalRefDetails> = Omit<T, "owner"> & {
  readonly owner?: Handle;
  readonly nativeComponent?: NativeMcpComponent;
};

import type {
  McpServerExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete MCP Server Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedMcpServerRef = McpServerExtensionRefBase<"git-hosted", GitBasedSource> &
  ExternalMcpRefDetails<GitHostedRefDetails>;
/** @experimental */
export type RegistryMcpServerRef = McpServerExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalMcpServerRef = McpServerExtensionRefBase<"local", LocalSource> &
  ExternalMcpRefDetails<LocalRefDetails>;
/** @experimental */
export type WorkspaceMcpServerRef = McpServerExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type McpServerExtensionRef =
  GitHostedMcpServerRef | RegistryMcpServerRef | LocalMcpServerRef | WorkspaceMcpServerRef;
