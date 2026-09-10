import * as Effect from "effect/Effect";

import type {
  KnowledgeConceptNotFound,
  KnowledgeCorpusUnavailable,
  KnowledgeRequestInvalid,
} from "@agentxm/knowledge-query";

import { makeAppError, type AppError } from "../../app-error/index.js";

/** Knowledge discovery's typed refusals, rendered in the CLI's error envelope. */
export type KnowledgeFeatureFailure =
  KnowledgeRequestInvalid | KnowledgeCorpusUnavailable | KnowledgeConceptNotFound;

export const knowledgeFailureToAppError = (failure: KnowledgeFeatureFailure): AppError => {
  switch (failure._tag) {
    case "KnowledgeRequestInvalid":
      return makeAppError({ code: "validation", detail: failure.detail });
    case "KnowledgeConceptNotFound":
      return makeAppError({
        code: "not_found",
        detail: `Knowledge concept "${failure.reference}" was not found in the selected installed corpus`,
      });
    case "KnowledgeCorpusUnavailable":
      return makeAppError({
        code: failure.reason === "bundle-not-installed" ? "not_found" : "conflict",
        detail: failure.detail,
        ...(failure.cause === undefined ? {} : { cause: failure.cause }),
      });
  }
};

/** Refusals every corpus-reading operation can report. */
export const knowledgeCorpusFailures = {
  KnowledgeRequestInvalid: (failure: KnowledgeRequestInvalid) =>
    Effect.fail(knowledgeFailureToAppError(failure)),
  KnowledgeCorpusUnavailable: (failure: KnowledgeCorpusUnavailable) =>
    Effect.fail(knowledgeFailureToAppError(failure)),
} as const;

/** The same, plus the exact-reference refusal `get` and `related` can report. */
export const knowledgeConceptFailures = {
  ...knowledgeCorpusFailures,
  KnowledgeConceptNotFound: (failure: KnowledgeConceptNotFound) =>
    Effect.fail(knowledgeFailureToAppError(failure)),
} as const;
