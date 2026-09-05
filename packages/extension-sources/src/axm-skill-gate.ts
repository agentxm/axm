/**
 * Official AXM skill candidate gate for registry resolution.
 *
 * Resolving the official AXM skill from a registry is gated on whether the
 * candidate release is compatible with the running CLI. That policy is owned
 * above this integration, so the registry host provider consumes it through
 * this port: candidate bytes in, a rendered verdict out. The composition
 * root implements it from the extension-workspace compatibility policy (see
 * the application runtime's axm-skill gate Live).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Data from "effect/Data";
import * as ServiceMap from "effect/Context";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { CarriedFailureCategory } from "./failure-category.js";

/**
 * The gate implementation could not produce a verdict. The implementation
 * owns the category and wording at construction; the provider transports the
 * failure without re-rendering it.
 */
export class AxmSkillGateUnavailable extends Data.TaggedError("AxmSkillGateUnavailable")<{
  readonly category: CarriedFailureCategory;
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/** A candidate extracted to disk for evaluation. */
export interface AxmSkillCandidate {
  readonly ref: SkillExtensionRef;
  readonly packageRoot: string;
  readonly skillSourcePath: string;
}

/**
 * The rendered compatibility verdict for one official AXM skill candidate:
 * the incompatibility sentence and the recovery command and target already
 * rendered by the policy owner.
 */
export interface AxmSkillCandidateVerdict {
  readonly status: "compatible" | "incompatible";
  readonly detail: string | null;
  readonly recoveryCommand: string | null;
  readonly recoveryTarget: string;
}

export interface AxmSkillCandidateGateService {
  /**
   * Evaluate one extracted candidate. `null` means the candidate is not the
   * official AXM skill and the gate does not apply.
   */
  readonly evaluate: (
    candidate: AxmSkillCandidate,
  ) => Effect.Effect<
    AxmSkillCandidateVerdict | null,
    AxmSkillGateUnavailable,
    FileSystem.FileSystem | Path.Path
  >;
}

export class AxmSkillCandidateGate extends ServiceMap.Service<
  AxmSkillCandidateGate,
  AxmSkillCandidateGateService
>()("@agentxm/extension-sources/axm-skill-gate/AxmSkillCandidateGate") {}
