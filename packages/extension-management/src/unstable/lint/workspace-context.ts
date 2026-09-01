/**
 * Workspace lint rule contexts and accessors.
 *
 * These context types bind the workspace read model, desired-state health,
 * and projection facts to `workspace/*` rules. They complement the
 * contract-level rule contexts owned by `@agentxm/registry-protocol`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { InstructionProjectionSnapshot } from "../workspace-configuration/instructions.js";
import type { AppError } from "../app-error/index.js";
import type { PackDependencyReachability } from "../packs/dependency-reachability.js";
import type { ProjectionInvariantFact } from "../projection/index.js";
import type { AxmSkillCompatibility } from "../skills/axm-skill-compatibility.js";
import type { CanonicalObservation } from "@agentxm/workspace-state";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";
import type { LockfileReadError, SettingsReadError } from "@agentxm/workspace-state";
import type { WorkspaceReadModel } from "@agentxm/workspace-state";
import type { WorkspaceOwnershipIssue } from "../extension-workspace/managed-file-discovery.js";

/**
 * Context passed to `workspace/*` rules.
 *
 * `subject.scope` is `"project"` (default) or `"user"` (user-level `.axm/`).
 * Rules whose invariants apply at only one scope early-return `[]` via the
 * `check` body.
 *
 * `subject.root` is an absolute filesystem path pinning the workspace root;
 * typed as `string` in Phase 2 so the rule primitives don't depend on a
 * platform-specific path brand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceRuleContext {
  readonly subject: WorkspaceSubject;
  readonly workspace: WorkspaceReadModel;
  readonly axmDirExists: Effect.Effect<boolean>;
  readonly instructions?: WorkspaceInstructionAccessor;
  /** Read-back currency for aggregate managed output units. */
  readonly projections?: WorkspaceProjectionsAccessor;
  readonly ownership?: Effect.Effect<ReadonlyArray<WorkspaceOwnershipIssue>>;
  /**
   * Installed non-pack extension manifests, keyed by nothing — rules walk the
   * list. Landed for `workspace/recommended-packs-retained`, which needs the
   * `standalone` / `recommendedPacks` pair that the lockfile does not carry.
   *
   * Optional so callers that build a context by hand (tests, and any caller
   * predating the accessor) stay valid; rules that need it early-return `[]`
   * when it is absent.
   */
  readonly installedExtensions?: WorkspaceInstalledExtensionAccessor;
  /** Pre-joined, offline pack/member version reachability for workspace rules. */
  readonly packDependencyReachability?: Effect.Effect<ReadonlyArray<PackDependencyReachability>>;
  /** Effective configured owner (project, then user scope), when available. */
  readonly owner?: Effect.Effect<Option.Option<Handle>>;
  /** One caller-built evaluation over the authoritative installed AXM skill. */
  readonly axmSkillCompatibility?: Effect.Effect<
    AxmSkillCompatibility,
    SettingsReadError | LockfileReadError
  >;
  /** Deterministic desired-state preflight used by local reconciliation-health rules. */
  readonly health?: {
    readonly desiredState: Effect.Effect<DesiredStateGraph, AppError>;
    readonly canonicalObservations?: Effect.Effect<
      ReadonlyArray<{
        readonly desired: DesiredExtensionNode;
        readonly observation: CanonicalObservation;
      }>,
      AppError
    >;
  };
  readonly displayRoot: string;
}

/**
 * One observation of the instruction projection per lint run, shared by every
 * instruction rule so target and `.gitignore` facts come from the same moment.
 * `None` when instruction-file management is not enabled.
 */
export interface WorkspaceInstructionAccessor {
  readonly snapshot: Effect.Effect<Option.Option<InstructionProjectionSnapshot>>;
}

/**
 * Caller-bound shared facts for aggregate managed output units. Fact
 * evaluation suppresses unjudgeable intrinsic conclusions so lint does not
 * cascade from an incomplete desired-state graph or missing canonical input.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceProjectionsAccessor {
  /** One shared evaluation of output-derived intrinsic projection facts. */
  readonly facts: Effect.Effect<ReadonlyArray<ProjectionInvariantFact>>;
}

/**
 * Narrow accessor over the manifests of every installed non-pack extension.
 *
 * Packs are excluded — they carry neither `standalone` nor `recommendedPacks`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceInstalledExtensionAccessor {
  readonly manifests: Effect.Effect<ReadonlyArray<InstalledExtensionManifest>>;
}

/**
 * One installed extension's raw manifest, as read during workspace projection.
 *
 * `manifestJson` is loose parsed JSON, not a decoded manifest — consumers
 * narrow what they need. `undefined` when the manifest file is absent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstalledExtensionManifest {
  readonly extensionType: Exclude<ExtensionType, "pack">;
  readonly name: string;
  /** Workspace-root-relative posix path of the manifest file. */
  readonly manifestPath: string;
  readonly manifestJson: unknown;
}

/**
 * WorkspaceMutations subject: the rule-addressable identity of the workspace under lint.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceSubject {
  readonly root: string;
  readonly scope: "project" | "user";
}
