/**
 * The vocabulary every install and uninstall plan step shares.
 *
 * The per-type planners and the lifecycle use cases that compose them agree
 * on one requirement set for a plan step, one for resolving what a request
 * names, one resolved-ref shape, the refusal a source-resolution failure
 * reads with, and the held-release policy an install declares.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { ConfigError } from "effect/Config";
import type * as FileSystem from "effect/FileSystem";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type { RegistryClientFactory } from "@agentxm/registry-client";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

import type { NativeWriteAuthority } from "../agent-adapters/index.js";
import type { ManagerRequirements, McpServerManager } from "../materialization/index.js";
import {
  ExtensionResolutionFailed,
  type AcceptedPackMemberIncompatible,
  type HeldReleasePolicy,
  type PackDependencyRefResolver,
} from "../resolution/index.js";
import type {
  SourceHostProviders,
  SourceResolutionFailure,
  WorkspaceCatalog,
} from "../sources/index.js";
import { ExtensionLifecycleFailed, installRefused } from "../operations/index.js";
import type { CodingAgentRepository, WorkspaceInvariantFacts } from "../projection/index.js";
import type {
  AcceptedCanonicalRefError,
  AcceptedResolutionWriter,
  DesiredStateReader,
  DesiredStateWriter,
  ExtensionPaths,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../workspace-state/index.js";
import type { RecipeRequirements } from "./extensions/operations.js";
import { kernelFailureToStepFailure } from "./failure-rendering.js";

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

/**
 * What an install or uninstall plan step declares at execution time: the
 * manager's own requirements, the transaction scope its closure opens, and
 * the owned workspace-state ports and agent
 * repository its artifact observes. These travel with the step and are
 * composed once at the application's runtime boundary; nothing is captured
 * into a step's closure on the way, and no failure adapter is among them.
 */
export type InstallStepRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | McpServerManager
  | CodingAgentRepository
  | LockfileReader
  | WorkspaceRecords
  | WorkspaceInvariantFacts
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | DesiredStateReader
  | DesiredStateWriter
  | AcceptedResolutionWriter
  | ExtensionPaths
  | NativeWriteAuthority;

/**
 * What routing a source locator, probing configured registries, and reading
 * what a source contains all need.
 */
export type ResolveInstallRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | RegistryClientFactory
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader;

// -----------------------------------------------------------------------------
// Failures
// -----------------------------------------------------------------------------

/**
 * Refuse an install because a source could not be resolved or read. The
 * kernel's rendering of the resolution failure decides the category, title,
 * sentence, evidence, and recoveries — the same ones the failure reads with
 * wherever else it surfaces — and the feature adds only the recoveries of
 * its own that follow them.
 */
export const sourceResolutionRefused = (
  cause: SourceResolutionFailure,
  suggestions: NonNullable<ExtensionLifecycleFailed["suggestions"]> = [],
): ExtensionLifecycleFailed => {
  const rendered = kernelFailureToStepFailure(cause);
  const carried = [...(rendered.suggestions ?? []), ...suggestions];
  return new ExtensionLifecycleFailed({
    category: rendered.category,
    ...(rendered.title === undefined ? {} : { title: rendered.title }),
    detail: rendered.detail,
    ...(rendered.metadata === undefined ? {} : { metadata: rendered.metadata }),
    ...(rendered.retryable === undefined ? {} : { retryable: rendered.retryable }),
    ...(carried.length === 0 ? {} : { suggestions: carried }),
    cause,
  });
};

/** The sentence a source-resolution failure reads with, for probe evidence. */
export const sourceResolutionFailureDetail = (cause: SourceResolutionFailure): string =>
  kernelFailureToStepFailure(cause).detail;

/**
 * Everything settling a configured entry's install intent can fail with: the
 * install refusal, plus the resolution refusal a configured source carries
 * through with its own category and sentence.
 */
export type ConfiguredInstallFailure =
  ExtensionLifecycleFailed | ExtensionResolutionFailed | ConfigError;

/**
 * A resolution refusal already carries its own category and fact sentence —
 * a held release, an unsatisfiable constraint, a blocked source authority —
 * so it travels unchanged rather than being replaced with a generic conflict
 * the operator cannot act on. Anything else becomes the install refusal,
 * naming the configured entry that could not be resolved.
 */
export const configuredEntryResolutionRefused =
  (name: string) =>
  (cause: unknown): ConfiguredInstallFailure =>
    cause instanceof ExtensionResolutionFailed || cause instanceof ConfigError
      ? cause
      : installRefused({
          category: "conflict",
          detail: `Configured extension "${name}" could not be resolved`,
          cause,
        });

// -----------------------------------------------------------------------------
// Resolved refs and release policy
// -----------------------------------------------------------------------------

/** One discovered package and the constraint the request placed on it. */
export interface ResolvedInstallRef<TRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<VersionRange>;
}

/**
 * The authority a recovery uses instead of re-selecting members: every member
 * ref comes from the accepted resolution already recorded for it.
 */
export type PackRecoveryDependencyResolver = PackDependencyRefResolver<
  | AcceptedCanonicalRefError
  | ExtensionResolutionFailed
  | AcceptedPackMemberIncompatible
  | SourceResolutionFailure,
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
  | SourceHostProviders
  | Scope.Scope
  | FileSystem.FileSystem
  | Path.Path
>;

/**
 * What an install does when the minimum release age holds back every release
 * a constraint admits: keep a complete, usable accepted resolution, or refuse
 * before any write. Targeted and configured installs, and the sync recovery
 * that replays a configured install, all take their policy from here.
 */
export const INSTALL_HELD_RELEASE_POLICY: HeldReleasePolicy = "preserve-or-block";
