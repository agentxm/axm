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
import type * as Path from "effect/Path";
import * as ServiceMap from "effect/ServiceMap";
import type { AppError } from "../app-error/index.js";
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
  readonly profile: string;
  readonly resolvedVersion: string;
}

/**
 * Inputs for removing an MCP server from an agent's configuration.
 */
export interface RemoveMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
}

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
 * Each coding agent knows how to resolve its skills directory and
 * manage MCP server configuration entries.
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
  readonly all: Effect.Effect<ReadonlyArray<CodingAgent>, never>;
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
