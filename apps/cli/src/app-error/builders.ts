import { makeAppError } from "./app-error.js";
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
