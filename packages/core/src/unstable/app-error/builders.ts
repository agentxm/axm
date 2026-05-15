import { makeAppError } from "./app-error.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";

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
    code: "auth",
    detail: message,
    suggestions: [
      BC.run("axm login", "Run `axm login` to sign in, or set the AXM_TOKEN environment variable."),
    ],
    cause,
  });

export const errAuthTokenRequired = (cause?: unknown) =>
  makeAppError({
    code: "auth",
    detail: "No authentication token is available.",
    suggestions: [BC.do("Set the AXM_TOKEN environment variable instead of running `axm login`.")],
    cause,
  });

export const errPublishConflict = (args: { readonly version?: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "conflict",
    detail:
      args.version === undefined
        ? "Version already exists with different content."
        : `Version ${args.version} already exists with different content.`,
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
