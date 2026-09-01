/**
 * Workspace catalog port for source resolution.
 *
 * Source resolution interprets user input against workspace facts —
 * configured source hosts, the desired extension graph, and the skill
 * candidates visible on disk — without reaching into the workspace kernel.
 * This service declares exactly those facts as data; the composition root
 * implements it from the workspace layer (see
 * `cli-runtime/workspace-catalog-live.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { AppError } from "../app-error/index.js";
import type { SourceHostConfig } from "@agentxm/workspace-state";

/**
 * The slice of one desired extension that source resolution consumes:
 * enough to match a name to its configured source.
 */
export interface DesiredExtensionNodeView {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
  readonly source?: string | undefined;
}

export interface DesiredExtensionGraphView {
  readonly complete: boolean;
  readonly nodes: ReadonlyArray<DesiredExtensionNodeView>;
}

/**
 * Skill-name candidates for glob expansion and name fallback: locked,
 * configured, and on-disk skills, with on-disk locations already
 * normalized to filesystem paths.
 */
export interface SkillCandidates {
  readonly names: ReadonlyArray<string>;
  readonly configuredSkills: Readonly<Record<string, { readonly source?: string | undefined }>>;
  readonly onDiskByName: ReadonlyMap<string, string>;
}

export interface WorkspaceCatalogService {
  /** Absolute workspace root directory. */
  readonly workspaceRoot: string;
  readonly configuredSources: Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  readonly registrySourceHosts: Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    AppError
  >;
  readonly desiredExtensionGraph: Effect.Effect<DesiredExtensionGraphView, AppError>;
  readonly skillCandidates: Effect.Effect<SkillCandidates, AppError>;
}

export class WorkspaceCatalog extends ServiceMap.Service<
  WorkspaceCatalog,
  WorkspaceCatalogService
>()(
  "@agentxm/extension-management/unstable/source-resolution/workspace-catalog/WorkspaceCatalog",
) {}
