/**
 * Coding agent service contracts for extension managers.
 *
 * Defines the CodingAgent type and CodingAgentRepository service interface
 * that extension managers depend on. The concrete implementation
 * (DefaultCodingAgentRepository) lives in the CLI package.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as ServiceMap from "effect/ServiceMap";
import type { AppError } from "../app-error/index.js";
import type { CommandFrontmatter } from "../commands/command-content.js";
import type { CommandManifest } from "../commands/manifest-schema.js";
import type { Handle } from "../extensions/handle.js";
import type { Workspace } from "../workspace/service-interface.js";
import type { AgentId } from "./types.js";

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
  readonly serverName: string;
  readonly canonicalPath: string;
  readonly owner: Handle;
  readonly resolvedVersion: string;
}

/**
 * Inputs for removing an MCP server from an agent's configuration.
 */
export interface RemoveMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
}

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

/**
 * Scope for command directory resolution.
 */
export type CommandScope = "project" | "user";

/**
 * Inputs for resolving an agent's effective commands directory.
 */
export interface ResolveCommandsDirArgs {
  readonly workspaceRoot: string;
  readonly scope: CommandScope;
}

/**
 * Tagged outcome for commands-directory resolution.
 */
export type ResolveCommandsDirOutcome =
  | { readonly _tag: "supported"; readonly dir: string; readonly warnings: ReadonlyArray<string> }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string };

/**
 * Inputs for adding a command to an agent's commands directory.
 */
export interface AddCommandArgs {
  readonly workspaceRoot: string;
  readonly scope: CommandScope;
  readonly commandName: string;
  readonly frontmatter: Option.Option<CommandFrontmatter>;
  readonly body: string;
  readonly manifest: CommandManifest;
  readonly agentOverrides: Option.Option<Readonly<Record<string, unknown>>>;
  readonly force: boolean;
}

/**
 * Inputs for removing a command from an agent's commands directory.
 */
export interface RemoveCommandArgs {
  readonly workspaceRoot: string;
  readonly scope: CommandScope;
  readonly commandName: string;
}

/**
 * Outcome of a command sync operation (add or remove).
 */
export type CommandSyncOutcome =
  | {
      readonly _tag: "success";
      readonly renderedFilePath: string;
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

export type McpServerSyncOutcome =
  | { readonly _tag: "success" }
  | {
      readonly _tag: "fallback";
      readonly fallbackFrom: McpServerSyncFallbackSource;
      readonly reason: string;
    }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string }
  | { readonly _tag: "failed"; readonly reason: string };

/**
 * Agent-specific extension installation behavior.
 *
 * Each coding agent knows how to resolve its skills directory,
 * manage MCP server configuration entries, and manage command files.
 */
export interface CodingAgent {
  readonly id: AgentId;
  readonly resolveEffectiveSkillsDir: (
    args: ResolveSkillsDirArgs,
  ) => Effect.Effect<ResolveSkillsDirOutcome, AppError, Path.Path>;
  readonly addMcpServer: (
    args: AddMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
  readonly removeMcpServer: (
    args: RemoveMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
  readonly resolveEffectiveCommandsDir: (
    args: ResolveCommandsDirArgs,
  ) => Effect.Effect<ResolveCommandsDirOutcome, AppError, FileSystem.FileSystem | Path.Path>;
  readonly addCommand: (
    args: AddCommandArgs,
  ) => Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
  readonly removeCommand: (
    args: RemoveCommandArgs,
  ) => Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
}

/**
 * Repository for coding-agent implementations.
 *
 * Generic over `W` — the workspace service requirement. The CLI package
 * instantiates this with its concrete `Workspace` type; core keeps it
 * abstract to avoid a circular dependency.
 *
 * @typeParam W - Workspace service requirement for methods that need workspace context
 */
export interface CodingAgentRepositoryShape<W = never> {
  readonly get: (id: AgentId) => Effect.Effect<CodingAgent, AppError>;
  readonly all: Effect.Effect<ReadonlyArray<CodingAgent>, AppError>;
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<CodingAgent>, AppError, W>;
  readonly getUnknownConfiguredAgentIds: () => Effect.Effect<ReadonlyArray<string>, AppError, W>;
}

// ---------------------------------------------------------------------------
// Service Tag
// ---------------------------------------------------------------------------

/**
 * Repository for coding-agent implementations.
 *
 * Instantiates the generic CodingAgentRepositoryShape with the core Workspace
 * service for methods that need workspace context.
 */
export type CodingAgentRepositoryService = CodingAgentRepositoryShape<Workspace>;

export class CodingAgentRepository extends ServiceMap.Service<
  CodingAgentRepository,
  CodingAgentRepositoryService
>()("CodingAgentRepository") {}
