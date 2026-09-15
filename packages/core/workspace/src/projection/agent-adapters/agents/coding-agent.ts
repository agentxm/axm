/**
 * The per-agent native adapter contract.
 *
 * A `CodingAgent` knows one agent's native surfaces: where its skills live,
 * how its MCP configuration is written, and how a subagent document is
 * rendered and published. Every input crosses as plain data — rendered
 * entries, ownership metadata, banner text — so the adapter never depends on
 * workspace state or projection policy. Which agents are projection targets
 * is a core decision made elsewhere.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { CodingAgentFailure } from "../errors.js";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import type { SubagentRenderInput } from "../subagents/rendering/types.js";

/**
 * How one native artifact fared during a write.
 *
 * Mirrors the workspace-owned artifact-change vocabulary as plain literals so
 * the integration reports facts without importing core.
 */
export type NativeArtifactChange = "created" | "updated" | "unchanged" | "removed";

/**
 * Inputs for resolving an agent's effective skills directory.
 */
export interface ResolveSkillsDirArgs {
  readonly workspaceRoot: string;
}

/**
 * Tagged outcome for skills-directory resolution.
 */
export type ResolveSkillsDirOutcome =
  | { readonly _tag: "supported"; readonly dir: string }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string };

/**
 * Inputs for adding an MCP server to an agent's configuration.
 */
export interface AddMcpServerArgs {
  readonly workspaceRoot: string;
  readonly scope?: WorkspaceScope;
  readonly serverName: string;
  readonly canonicalPath: string;
  readonly owner: Handle;
  readonly resolvedVersion: string;
  readonly enabled?: boolean;
  readonly configValues?: Readonly<Record<string, string>>;
}

/**
 * Inputs for removing an MCP server from an agent's configuration.
 */
export interface RemoveMcpServerArgs {
  readonly workspaceRoot: string;
  readonly scope?: WorkspaceScope;
  readonly serverName: string;
  readonly disableOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Subagent types
// ---------------------------------------------------------------------------

/**
 * Inputs for resolving an agent's effective subagents directory.
 */
export interface ResolveSubagentsDirArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
}

/**
 * Tagged outcome for subagents-directory resolution.
 */
export type ResolveSubagentsDirOutcome =
  | { readonly _tag: "supported"; readonly dir: string; readonly warnings: ReadonlyArray<string> }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string };

/**
 * Inputs for adding a subagent to an agent's subagents directory.
 *
 * `input.ownershipBanner` carries the ownership banner the owning projection
 * rendered; the adapter places it where its own format allows a comment.
 */
export interface AddSubagentArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly input: SubagentRenderInput;
  readonly force: boolean;
}

/**
 * Inputs for removing a subagent from an agent's subagents directory.
 */
export interface RemoveSubagentArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly subagentName: string;
  /** Workspace-relative rendered file paths recorded at publication. */
  readonly renderedFilePaths: ReadonlyArray<string>;
}

/**
 * Outcome of a subagent sync operation (add or remove).
 */
export type SubagentSyncOutcome =
  | {
      readonly _tag: "success";
      readonly renderedFilePaths: ReadonlyArray<string>;
      readonly warnings: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "skipped";
      readonly reason: string;
    }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "conflict"; readonly reason: string };

// ---------------------------------------------------------------------------
// MCP types
// ---------------------------------------------------------------------------

export type McpServerSyncFallbackSource = "unsupported" | "disabled";

export interface McpServerSyncTarget {
  readonly path: string;
  readonly change: NativeArtifactChange;
}

export type McpServerSyncOutcome =
  | {
      readonly _tag: "success";
      readonly targets?: ReadonlyArray<McpServerSyncTarget>;
      readonly warnings?: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "fallback";
      readonly fallbackFrom: McpServerSyncFallbackSource;
      readonly reason: string;
      readonly targets?: ReadonlyArray<McpServerSyncTarget>;
      readonly warnings?: ReadonlyArray<string>;
    }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "nothing-runnable"; readonly reason: string }
  | { readonly _tag: "needs-input"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string }
  | { readonly _tag: "failed"; readonly reason: string };

/**
 * Agent-specific extension installation behavior.
 *
 * Each coding agent knows how to resolve its skills directory,
 * manage MCP server configuration entries, and manage subagent files.
 */
export interface CodingAgent {
  readonly id: AgentId;
  readonly resolveEffectiveSkillsDir: (
    args: ResolveSkillsDirArgs,
  ) => Effect.Effect<ResolveSkillsDirOutcome, CodingAgentFailure, Path.Path>;
  readonly addMcpServer: (
    args: AddMcpServerArgs,
  ) => Effect.Effect<
    McpServerSyncOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
  readonly removeMcpServer: (
    args: RemoveMcpServerArgs,
  ) => Effect.Effect<
    McpServerSyncOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
  readonly resolveEffectiveSubagentsDir: (
    args: ResolveSubagentsDirArgs,
  ) => Effect.Effect<
    ResolveSubagentsDirOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path
  >;
  readonly addSubagent: (
    args: AddSubagentArgs,
  ) => Effect.Effect<
    SubagentSyncOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
  readonly removeSubagent: (
    args: RemoveSubagentArgs,
  ) => Effect.Effect<
    SubagentSyncOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
}
