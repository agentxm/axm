import { makeAppError, type AppErrorCategory } from "./app-error.js";
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export const BC = {
  run: (cmd: string, description: string): Breadcrumb => ({
    task: `Run \`${cmd}\``,
    description,
  }),
  do: (description: string): Breadcrumb => ({
    task: "Recover",
    description,
  }),
} as const;

export const errAuthRequired = (message = "Authentication required", cause?: unknown) =>
  makeAppError({
    code: "AUTH_LOGIN_REQUIRED",
    category: "auth",
    message,
    breadcrumbs: [
      BC.run("axm login", "Run `axm login` to sign in, or set the AXM_TOKEN environment variable."),
    ],
    cause,
  });

export const errAuthTokenRequired = (cause?: unknown) =>
  makeAppError({
    code: "AUTH_TOKEN_REQUIRED",
    category: "auth",
    message: "No authentication token is available.",
    breadcrumbs: [BC.do("Set the AXM_TOKEN environment variable instead of running `axm login`.")],
    cause,
  });

export const errPublishConflict = (args: { readonly version?: string; readonly cause?: unknown }) =>
  makeAppError({
    code: "REGISTRY_PUBLISH_CONFLICT",
    category: "conflict",
    message:
      args.version === undefined
        ? "Version already exists with different content."
        : `Version ${args.version} already exists with different content.`,
    breadcrumbs: [BC.do("Bump the version in your manifest.")],
    cause: args.cause,
  });

export const errInstallFailed = (args: {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}) =>
  makeAppError({
    code: args.code,
    category: "validation",
    message: args.message,
    breadcrumbs: [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });

export const errRegistryPublishRejected = (args: {
  readonly reason: string;
  readonly message: string;
  readonly category?: AppErrorCategory;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}) =>
  makeAppError({
    code: "REGISTRY_PUBLISH_REJECTED",
    category: args.category ?? "validation",
    message: args.message,
    reason: args.reason,
    ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
    ...(args.httpStatus !== undefined ? { httpStatus: args.httpStatus } : {}),
    breadcrumbs: args.breadcrumbs ?? [BC.do("Check the extension package and try again.")],
    cause: args.cause,
  });
