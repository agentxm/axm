/**
 * Choosing among the extensions a source offers.
 *
 * When a source contains several skills or subagents and the request named
 * none of them, someone has to choose. Which candidates are offered and what
 * a choice means is this feature's; how the choice is asked for — a terminal
 * multiselect, a test double, nothing at all — is the application's.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";

import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import type { ExtensionLifecycleFailed } from "../errors.js";

/**
 * The person was asked which extensions to install and declined to answer.
 * Nothing was written and nothing is pending, so the application reports a
 * cancelled invocation rather than a failure.
 */
export class ExtensionSelectionCancelled extends Data.TaggedError("ExtensionSelectionCancelled")<{
  readonly message: string;
}> {}

/**
 * A surface that cannot open the choice refuses with the feature's own typed
 * failure rather than reporting a cancellation nobody made: declining is a
 * clean exit, being unable to ask is a refusal the operator must act on. Both
 * callers already carry the pair, so naming it here narrows nothing.
 */
export type ExtensionSelectionFailure = ExtensionSelectionCancelled | ExtensionLifecycleFailed;

export interface ExtensionSelectionInteractionService {
  /** Choose which of the discovered skills to install; at least one. */
  readonly selectSkills: (
    candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  ) => Effect.Effect<ReadonlyArray<SkillExtensionRef>, ExtensionSelectionFailure>;
  /** Choose which of the discovered subagents to install; at least one. */
  readonly selectSubagents: (
    candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
  ) => Effect.Effect<ReadonlyArray<SubagentExtensionRef>, ExtensionSelectionFailure>;
}

export class ExtensionSelectionInteraction extends ServiceMap.Service<
  ExtensionSelectionInteraction,
  ExtensionSelectionInteractionService
>()("@agentxm/extension-lifecycle/install/ExtensionSelectionInteraction") {}
