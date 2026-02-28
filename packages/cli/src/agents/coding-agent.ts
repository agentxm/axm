/**
 * Coding agent service contracts for skills installation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Path from "@effect/platform/Path";
import type * as FileSystem from "@effect/platform/FileSystem";
import type { CliError } from "../cli-error/index.js";
import type { Workspace } from "../workspace/service.js";
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

export interface AddMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
  readonly canonicalPath: string;
  readonly namespace: string;
  readonly resolvedVersion: string;
}

export interface RemoveMcpServerArgs {
  readonly workspaceRoot: string;
  readonly serverName: string;
}

export type McpServerSyncOutcome =
  | { readonly _tag: "success" }
  | { readonly _tag: "unsupported"; readonly reason: string }
  | { readonly _tag: "disabled"; readonly reason: string }
  | { readonly _tag: "misconfigured"; readonly reason: string }
  | { readonly _tag: "failed"; readonly reason: string };

/**
 * Agent-specific skills installation behavior.
 */
export interface CodingAgent {
  readonly id: AgentId;
  readonly resolveEffectiveSkillsDir: (
    args: ResolveSkillsDirArgs,
  ) => Effect.Effect<ResolveSkillsDirOutcome, CliError, Path.Path>;
  readonly addMcpServer: (
    args: AddMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path>;
  readonly removeMcpServer: (
    args: RemoveMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, CliError, FileSystem.FileSystem | Path.Path>;
}

/**
 * Repository for coding-agent implementations.
 */
export interface CodingAgentRepositoryService {
  readonly get: (id: AgentId) => Effect.Effect<CodingAgent, CliError>;
  readonly all: Effect.Effect<ReadonlyArray<CodingAgent>, never>;
  readonly getConfiguredAgents: () => Effect.Effect<
    ReadonlyArray<CodingAgent>,
    CliError,
    Workspace
  >;
  readonly getUnknownConfiguredAgentIds: () => Effect.Effect<
    ReadonlyArray<string>,
    CliError,
    Workspace
  >;
}

export class CodingAgentRepository extends Context.Tag("CodingAgentRepository")<
  CodingAgentRepository,
  CodingAgentRepositoryService
>() {}
