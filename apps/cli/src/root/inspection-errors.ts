import type {
  ExtensionNotInstalled,
  PackInspectionRefused,
  PublishedMetadataUnavailable,
} from "@agentxm/workspace-inspection";
import {
  extensionTypeSentenceLabels,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";

import { makeAppError, type AppError } from "../app-error/index.js";
import { commandForScope } from "./shared/scoped-command.js";

/** The named extension is not installed: offer the matching inventory command. */
export const extensionNotInstalledToAppError = (failure: ExtensionNotInstalled): AppError => {
  const label = extensionTypeSentenceLabels[failure.type];
  return makeAppError({
    code: "not_found",
    detail: `${label} "${failure.name}" is not installed`,
    suggestions: [
      {
        description: `Inspect installed ${label} entries`,
        cmd: commandForScope(`axm ${toExtensionTypePlural(failure.type)} list`, failure.scope),
      },
    ],
  });
};

export const packInspectionRefusedToAppError = (failure: PackInspectionRefused): AppError =>
  makeAppError({
    code:
      failure.reason === "not-configured" ||
      failure.reason === "canonical-unavailable" ||
      failure.reason === "manifest-unavailable"
        ? "not_found"
        : failure.reason === "identity-mismatch"
          ? "conflict"
          : "validation",
    detail: failure.detail,
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
  });

export const publishedMetadataUnavailableToAppError = (
  failure: PublishedMetadataUnavailable,
): AppError => {
  switch (failure.reason) {
    case "workspace-not-initialized":
      return makeAppError({
        code: "usage",
        detail: failure.detail,
        suggestions: [{ description: "Initialize this workspace first.", cmd: "axm setup" }],
      });
    case "registry-not-configured":
      return makeAppError({ code: "not_found", detail: failure.detail });
    case "ambiguous-name":
      return makeAppError({
        code: "validation",
        detail: failure.detail,
        suggestions: [{ description: "Re-run with --type or the fully-qualified name." }],
      });
    case "unqualified-name":
      return makeAppError({
        code: "validation",
        detail: failure.detail,
        suggestions: [
          {
            description:
              "Use a fully-qualified handle like @owner/skills/name, or pass --type for a bare name.",
          },
        ],
      });
    case "not-found":
      return makeAppError({
        code: "not_found",
        detail: failure.detail,
        suggestions: [{ description: "Sign in if this extension is private.", cmd: "axm login" }],
      });
    case "unknown-field":
      return makeAppError({ code: "not_found", detail: failure.detail });
    case "field-unavailable":
      return makeAppError({ code: "validation", detail: failure.detail });
  }
};
