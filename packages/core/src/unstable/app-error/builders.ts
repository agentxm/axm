import { makeAppError } from "./app-error.js";
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export const BC = {
  run: (cmd: string, description: string): Breadcrumb => ({
    description,
    cmd,
  }),
  do: (description: string): Breadcrumb => ({
    description,
  }),
} as const;

export const errAuthRequired = (message = "Authentication required", cause?: unknown) =>
  makeAppError({
    code: "auth",
    message,
    breadcrumbs: [
      BC.run("axm login", "Run `axm login` to sign in, or set the AXM_TOKEN environment variable."),
    ],
    cause,
  });

export const errAuthTokenRequired = (cause?: unknown) =>
  makeAppError({
    code: "auth",
    message: "No authentication token is available.",
    breadcrumbs: [BC.do("Set the AXM_TOKEN environment variable instead of running `axm login`.")],
    cause,
  });

export const errPublishConflict = (args: { readonly version?: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "conflict",
    message:
      args.version === undefined
        ? "Version already exists with different content."
        : `Version ${args.version} already exists with different content.`,
    breadcrumbs: [BC.do("Bump the version in your manifest.")],
    cause: args.cause,
  });

export const errInstallFailed = (args: { readonly message: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "validation",
    message: args.message,
    breadcrumbs: [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });

export const errRegistryPublishRejected = (args: {
  readonly message: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}) =>
  makeAppError({
    code: "validation",
    message: args.message,
    breadcrumbs: args.breadcrumbs ?? [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });
