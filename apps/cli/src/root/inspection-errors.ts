import type {
  ExtensionNotInstalled,
  PackInspectionRefused,
  PublishedMetadataUnavailable,
} from "@agentxm/workspace/inspection";
import { extensionTypeSentenceLabels } from "@agentxm/extension-model/unstable/extensions";

import { makeAppError, type AppError } from "../app-error/index.js";
import { EXTENSION_TYPE_PRESENTATION } from "./extension-type-presentation.js";

/**
 * The named extension is not installed: offer the type's inspection command
 * from the presentation table. The workspace boundary the command ran in
 * addresses it to that scope.
 */
export const extensionNotInstalledToAppError = (failure: ExtensionNotInstalled): AppError =>
  makeAppError({
    code: "not_found",
    detail: `${extensionTypeSentenceLabels[failure.type]} "${failure.name}" is not installed`,
    suggestions: [EXTENSION_TYPE_PRESENTATION[failure.type].inspect],
  });

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

/**
 * `offerSignIn` decides one thing: whether a miss suggests signing in.
 *
 * A read hides an extension the caller may not see behind the same not-found
 * as one that does not exist, so a signed-out reader is told that signing in
 * may change the answer. For someone already signed in it cannot, and saying
 * so would send them round a loop that ends where it started.
 */
export const publishedMetadataUnavailableToAppError = (
  failure: PublishedMetadataUnavailable,
  offerSignIn: boolean,
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
        ...(offerSignIn
          ? {
              suggestions: [
                { description: "Sign in if this extension is private.", cmd: "axm login" },
              ],
            }
          : {}),
      });
    case "unknown-field":
      return makeAppError({ code: "not_found", detail: failure.detail });
    case "field-unavailable":
      return makeAppError({ code: "validation", detail: failure.detail });
  }
};
