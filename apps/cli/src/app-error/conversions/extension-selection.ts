import type {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/extension-lifecycle/skills/application";
import type {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/extension-lifecycle/subagents/application";
import { AppError, makeAppError } from "../app-error.js";

export const skillSelectionNotFoundToAppError = (error: SkillSelectionNotFound): AppError =>
  makeAppError({
    code: "not_found",
    detail: `No skills matched: ${error.requested.join(", ")}. Source contains: ${[
      ...error.available,
    ]
      .sort((left, right) => left.localeCompare(right))
      .join(", ")}`,
    recover: "Check the skill names or patterns and try again",
  });

export const subagentSelectionNotFoundToAppError = (error: SubagentSelectionNotFound): AppError =>
  makeAppError({
    code: "internal",
    detail: `No subagents matched: ${error.requested.join(", ")}`,
    suggestions: [{ description: "Check the subagent names or patterns and try again." }],
  });

export const selectionUnavailableToAppError = (
  error: SkillSelectionUnavailable | SubagentSelectionUnavailable,
): AppError => {
  // Terminal guidance remains here; another interface may supply a different cause.
  if (error.cause instanceof AppError) return error.cause;
  const skill = error._tag === "SkillSelectionUnavailable";
  return makeAppError({
    code: "usage",
    detail: `Unable to obtain a ${skill ? "skill" : "subagent"} selection`,
    recover: `Name the ${skill ? "skills with --skill" : "subagents with --subagent"}, take them all with --all, or use an interactive terminal.`,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });
};
