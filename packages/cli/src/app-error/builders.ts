import { makeAppError, type AppError, type AppErrorCode } from "./app-error.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export const BC = {
  run: (cmd: string, description: string): SuggestedAction => ({
    description,
    cmd,
  }),
  do: (description: string): SuggestedAction => ({
    description,
  }),
} as const;

export const errAuthRequired = (message = "Authentication required", cause?: unknown) =>
  makeAppError({
    code: "auth_required",
    detail: message,
    blockedOn: "human",
    suggestions: [
      BC.run(
        "axm login --device-code --json",
        "Start a non-blocking device sign-in and ask a person to approve it.",
      ),
      {
        description: "Create a personal access token in AgentXM.ai.",
        url: "https://agentxm.ai/u/settings/tokens",
      },
    ],
    cause,
  });

export const errPublishConflict = (args: { readonly version?: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "conflict",
    detail:
      args.version === undefined
        ? "Version already exists."
        : `Version ${args.version} already exists.`,
    suggestions: [BC.do("Bump the version in your manifest.")],
    cause: args.cause,
  });

export const errInstallFailed = (args: { readonly message: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "validation",
    detail: args.message,
    suggestions: [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });

export const errRegistryPublishRejected = (args: {
  readonly message: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}) =>
  makeAppError({
    code: "validation",
    detail: args.message,
    suggestions: args.suggestions ?? [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });

/**
 * Change endpoint semantics on a mapped envelope while preserving failure
 * evidence and recovery. Owned here with the envelope vocabulary; the
 * registry integration's typed analogue is `withRegistrySemantics`.
 */
export const withAppErrorSemantics = (
  error: AppError,
  semantics: {
    readonly code?: AppErrorCode;
    readonly title?: string;
    readonly detail?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
  },
): AppError =>
  makeAppError({
    code: semantics.code ?? error.code,
    title: semantics.title ?? error.title,
    detail: semantics.detail ?? error.detail,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.problem === undefined ? {} : { problem: error.problem }),
    ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
    ...(error.action === undefined ? {} : { action: error.action }),
    ...(semantics.suggestions === undefined
      ? error.suggestions === undefined
        ? {}
        : { suggestions: error.suggestions }
      : { suggestions: semantics.suggestions }),
    cause: error.cause,
  });
