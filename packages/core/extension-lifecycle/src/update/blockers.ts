/**
 * Why a targeted update may not proceed, said once.
 *
 * Every reason a named update is refused is a fact about the workspace, not
 * about the command that asked: the extension is not desired, the entry is
 * turned off, a Pack owns the constraint the request would fork, the Pack
 * graph cannot prove ownership, the declared constraints do not intersect,
 * the source is the copy embedded in this executable, the source is
 * workspace-authored, or the ownership context went stale under the
 * transition. The sentence and the blocking class belong here so preview,
 * apply, and machine output all report the same refusal.
 *
 * What a person should type next is the application's to render: the blocker
 * travels as `blocking.reference`, and the adapter maps it to the command it
 * knows how to spell.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  TargetedUpdateBlocker,
  TargetedUpdatePublicContext,
} from "@agentxm/extension-resolution";
import type { BlockingClass } from "@agentxm/workspace-operations";

import { TARGETED_UPDATE_STALE_DETAIL } from "./targeted-plan.js";

/** The refusal sentence for one classified blocker. */
export const blockerDetail = (context: TargetedUpdatePublicContext): string => {
  const withRelevantProblems = (detail: string): string =>
    context.relevantProblems.length === 0
      ? detail
      : `${detail}. ${context.relevantProblems.join("; ")}`;

  if (context.blocker === undefined) {
    return `Update ${context.target.fqn} is blocked`;
  }

  switch (context.blocker) {
    case "not-desired":
      return `${context.target.fqn} is not desired by this workspace`;
    case "disabled":
      return `${context.target.fqn} is effectively disabled`;
    case "pack-owned-constraint":
      return `${context.target.fqn} is pack-owned; a targeted version range would create direct intent`;
    case "incomplete-graph":
      return withRelevantProblems(
        `Pack membership is incomplete, so ownership of ${context.target.fqn} cannot be proven`,
      );
    case "constraint-conflict":
      return withRelevantProblems(
        `The desired constraints for ${context.target.fqn} have no compatible intersection`,
      );
    case "bundled-source":
      return `${context.target.fqn} uses the skill embedded in this AXM executable and cannot be advanced from the Registry`;
    case "source-authority":
      return `${context.target.fqn} is workspace-authored and cannot be replaced from the Registry`;
    case "stale-plan":
      return TARGETED_UPDATE_STALE_DETAIL;
  }
};

/**
 * Which kind of blocking a refusal is: a policy the workspace chose to
 * enforce, a precondition the workspace does not meet, or an answer that went
 * out of date.
 */
export const blockerClass = (blocker: TargetedUpdateBlocker | undefined): BlockingClass => {
  switch (blocker) {
    case "pack-owned-constraint":
    case "bundled-source":
    case "source-authority":
      return "policy-excluded";
    case "stale-plan":
      return "stale-candidate";
    default:
      return "precondition-unmet";
  }
};

/** The ownership context a stale outcome reports: nothing moved. */
export const staleOutputContext = (
  context: TargetedUpdatePublicContext,
): TargetedUpdatePublicContext => ({
  ...context,
  authority: "blocked",
  blocker: "stale-plan",
  effects: {
    settings: "unchanged",
    acceptedResolution: "unchanged",
    canonical: "unchanged",
    projection: "unchanged",
    packRoot: "unchanged",
    packManifest: "unchanged",
  },
});
