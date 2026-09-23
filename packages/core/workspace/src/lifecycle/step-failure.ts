/**
 * The rendering of the extension-lifecycle failure family — lifecycle policy
 * refusals and extension selection — and how a lifecycle closure serializes
 * any failure into the plan-step vocabulary.
 *
 * The lifecycle family renders here once. Every other family a lifecycle step
 * can surface renders through the workspace failure rendering, so a lifecycle
 * step reports the same category, sentence, and recovery a command boundary
 * would print for the same failure. The kernel supplies this conversion as a
 * Layer; the application only provides it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Layer from "effect/Layer";

import type {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "../skills/lifecycle/application/index.js";
import type {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "../subagents/lifecycle/application/index.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";
import { workspaceFailureToStepFailure } from "../reconciliation/failure-rendering.js";

import type { ExtensionLifecycleFailed } from "./errors.js";
import type { InstallSelectionUnavailable } from "./install/selection.js";
import { StepFailureConversion, type LifecycleFailure } from "./step-failure-conversion.js";

/** Every failure lifecycle policy and extension selection construct. */
export type LifecycleFamilyFailure =
  | ExtensionLifecycleFailed
  | SkillSelectionNotFound
  | SubagentSelectionNotFound
  | SkillSelectionUnavailable
  | SubagentSelectionUnavailable
  | InstallSelectionUnavailable;

const selectionSubject = (
  error: SkillSelectionUnavailable | SubagentSelectionUnavailable | InstallSelectionUnavailable,
) => {
  switch (error._tag) {
    case "SkillSelectionUnavailable":
      return { article: "a", noun: "skill", flags: "skills with --skill" };
    case "SubagentSelectionUnavailable":
      return { article: "a", noun: "subagent", flags: "subagents with --subagent" };
    case "InstallSelectionUnavailable":
      return {
        article: "an",
        noun: "extension",
        flags: "extensions with their per-type flags",
      };
  }
};

/** Translate one lifecycle policy or selection failure. */
export const lifecycleFailureToStepFailure = (error: LifecycleFamilyFailure): StepFailure => {
  switch (error._tag) {
    case "ExtensionLifecycleFailed":
      return makeStepFailure({
        category: error.category,
        title: error.title,
        detail: error.detail,
        recover: error.recover,
        cmd: error.cmd,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "SkillSelectionNotFound":
      return makeStepFailure({
        category: "not_found",
        detail: `No skills matched: ${error.requested.join(", ")}. Source contains: ${[
          ...error.available,
        ]
          .sort((left, right) => left.localeCompare(right))
          .join(", ")}`,
        recover: "Check the skill names or patterns and try again",
      });
    case "SubagentSelectionNotFound":
      return makeStepFailure({
        category: "internal",
        detail: `No subagents matched: ${error.requested.join(", ")}`,
        suggestions: [{ description: "Check the subagent names or patterns and try again." }],
      });
    case "SkillSelectionUnavailable":
    case "SubagentSelectionUnavailable":
    case "InstallSelectionUnavailable": {
      const selection = selectionSubject(error);
      return makeStepFailure({
        category: "usage",
        detail: `Unable to obtain ${selection.article} ${selection.noun} selection`,
        recover: `Name the ${selection.flags}, take them all with --all, or use an interactive terminal.`,
        cause: error.cause,
      });
    }
  }
};

/** Every failure a lifecycle closure can settle a plan step with. */
export type LifecycleStepFailure = LifecycleFailure;

/**
 * Serialize one lifecycle-closure failure into the plan-step vocabulary, the
 * same rendering the command boundary projects for that failure.
 */
export const lifecycleStepFailure = (failure: LifecycleStepFailure): StepFailure =>
  workspaceFailureToStepFailure(failure);

/** The kernel's lifecycle failure conversion, provided once per invocation. */
export const LifecycleFailureConversionLive = Layer.succeed(StepFailureConversion, {
  toStepFailure: (failure) => lifecycleStepFailure(failure),
});
