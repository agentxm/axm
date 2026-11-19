import type {
  ArchivalTransition,
  DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry";

import { recordDoc, type Doc, type Field } from "../../screen/index.js";

/** A deprecation's settled record: what changed, at which revision, and its guidance. */
export const deprecationDoc = (transition: DeprecationTransition): Doc => {
  const verb =
    transition.disposition === "created"
      ? "Deprecated"
      : transition.disposition === "edited"
        ? "Updated deprecation for"
        : transition.disposition === "restored"
          ? "Restored"
          : transition.after === null
            ? "Already active"
            : "Deprecation already current for";
  const replacement = transition.after?.replacement;
  const fields: ReadonlyArray<Field | undefined> = [
    {
      label: "State",
      value: `${transition.before === null ? "active" : "deprecated"} to ${transition.after === null ? "active" : "deprecated"}`,
    },
    { label: "Revision", value: transition.revision },
    transition.after === null ? undefined : { label: "Reason", value: transition.after.reason },
    transition.after?.message === undefined
      ? undefined
      : { label: "Message", value: transition.after.message },
    replacement === undefined
      ? undefined
      : {
          label: "Replacement",
          value:
            replacement.status === "available"
              ? replacement.fqn
              : replacement.fqn === undefined
                ? "unavailable or not visible"
                : `${replacement.fqn} (unavailable)`,
        },
  ];
  return recordDoc({ tone: "ok", verdict: `${verb} ${transition.target}`, fields });
};

/** An archival's settled record: what changed, at which revision, and its message. */
export const archivalDoc = (transition: ArchivalTransition): Doc => {
  const verb =
    transition.disposition === "created"
      ? "Archived"
      : transition.disposition === "edited"
        ? "Updated archive message for"
        : transition.disposition === "restored"
          ? "Unarchived"
          : transition.after === null
            ? "Already active"
            : "Already archived";
  return recordDoc({
    tone: "ok",
    verdict: `${verb} ${transition.target}`,
    fields: [
      {
        label: "State",
        value: `${transition.before === null ? "active" : "archived"} to ${transition.after === null ? "active" : "archived"}`,
      },
      { label: "Revision", value: transition.revision },
      transition.after?.message === undefined
        ? undefined
        : { label: "Message", value: transition.after.message },
    ],
  });
};
