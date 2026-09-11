/**
 * Which of a source's subagents this request installs.
 *
 * The same decision the skill route makes, over subagent names: named
 * patterns must match, `--all` and an unattended invocation take everything,
 * a single subagent needs no decision, and anything else is a person's
 * choice.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";

import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { expandGlobs } from "../../glob.js";
import {
  ExtensionSelectionInteraction,
  type ExtensionSelectionCancelled,
} from "../../install/selection-interaction.js";
import { installRefused } from "../../install/vocabulary.js";

export interface SubagentSelectionRequest {
  /** Names or glob patterns the request named explicitly. */
  readonly requestedSubagents: ReadonlyArray<string>;
  /** Take everything the source offers without asking. */
  readonly all: boolean;
  /** No prompt can open in this invocation. */
  readonly nonInteractive: boolean;
}

/** Settle which discovered subagents this request installs. */
export const determineSubagentsToInstall: (
  subagents: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
  request: SubagentSelectionRequest,
) => Effect.Effect<
  ReadonlyArray<SubagentExtensionRef>,
  ExtensionLifecycleFailed | ExtensionSelectionCancelled,
  ExtensionSelectionInteraction
> = Effect.fn("InstallExtensions.determineSubagentsToInstall")(function* (
  subagents: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
  request: SubagentSelectionRequest,
) {
  if (request.requestedSubagents.length > 0) {
    const allNames = Array.map(subagents, (subagent) => subagent.subagent.name);
    const matched = expandGlobs(request.requestedSubagents, allNames);
    if (matched.length === 0) {
      return yield* installRefused({
        category: "internal",
        detail: `No subagents matched: ${request.requestedSubagents.join(", ")}`,
        suggestions: [{ description: "Check the subagent names or patterns and try again." }],
      });
    }
    return Array.filter(subagents, (subagent) => matched.includes(subagent.subagent.name));
  }

  if (request.all || request.nonInteractive) return subagents;
  if (subagents.length === 1) return subagents;

  const interaction = yield* ExtensionSelectionInteraction;
  return yield* interaction.selectSubagents(subagents);
});
