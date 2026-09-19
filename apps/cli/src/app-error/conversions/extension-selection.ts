import type {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";
import type {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/workspace/subagents/lifecycle/application";
import type { InstallSelectionUnavailable } from "@agentxm/workspace/lifecycle";
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
  error: SkillSelectionUnavailable | SubagentSelectionUnavailable | InstallSelectionUnavailable,
): AppError => {
  // Terminal guidance remains here; another interface may supply a different cause.
  if (error.cause instanceof AppError) return error.cause;
  const selection =
    error._tag === "SkillSelectionUnavailable"
      ? { article: "a", noun: "skill", flags: "skills with --skill" }
      : error._tag === "SubagentSelectionUnavailable"
        ? { article: "a", noun: "subagent", flags: "subagents with --subagent" }
        : {
            article: "an",
            noun: "extension",
            flags: "extensions with their per-type flags",
          };
  return makeAppError({
    code: "usage",
    detail: `Unable to obtain ${selection.article} ${selection.noun} selection`,
    recover: `Name the ${selection.flags}, take them all with --all, or use an interactive terminal.`,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });
};
