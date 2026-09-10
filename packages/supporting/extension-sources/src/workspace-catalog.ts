/**
 * Workspace catalog port for source resolution.
 *
 * Source resolution interprets user input against workspace facts —
 * configured source hosts, the desired extension graph, and the skill
 * candidates visible on disk — without reaching into the workspace kernel.
 * This service declares exactly those facts as data over the contract's
 * source-host vocabulary; the composition root implements it from the
 * workspace layer (see the application runtime's workspace-catalog Live).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as ServiceMap from "effect/Context";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type {
  GitHostingSourceHost,
  RegistrySourceHost,
} from "@agentxm/extension-model/unstable/sources/types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { CarriedFailureCategory } from "./failure-category.js";

/**
 * A source host the workspace has configured: a git-hosting forge or a
 * package registry, in the contract's source-host shape.
 */
export type ConfiguredSourceHost = GitHostingSourceHost | RegistrySourceHost;

/**
 * The catalog implementation could not produce a workspace fact. The
 * implementation owns the category and wording at construction; source
 * resolution transports the failure — and keys fallback decisions on the
 * category — without re-rendering it.
 */
export class WorkspaceCatalogUnavailable extends Data.TaggedError("WorkspaceCatalogUnavailable")<{
  readonly category: CarriedFailureCategory;
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

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
  readonly configuredSources: Effect.Effect<
    ReadonlyArray<ConfiguredSourceHost>,
    WorkspaceCatalogUnavailable
  >;
  readonly registrySourceHosts: Effect.Effect<
    ReadonlyArray<RegistrySourceHost>,
    WorkspaceCatalogUnavailable
  >;
  readonly desiredExtensionGraph: Effect.Effect<
    DesiredExtensionGraphView,
    WorkspaceCatalogUnavailable
  >;
  readonly skillCandidates: Effect.Effect<SkillCandidates, WorkspaceCatalogUnavailable>;
}

export class WorkspaceCatalog extends ServiceMap.Service<
  WorkspaceCatalog,
  WorkspaceCatalogService
>()("@agentxm/extension-sources/workspace-catalog/WorkspaceCatalog") {}
