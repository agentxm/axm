import * as Data from "effect/Data";

import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";

export type AppErrorCategory =
  | "usage"
  | "not_found"
  | "auth"
  | "forbidden"
  | "conflict"
  | "rate_limit"
  | "network"
  | "validation"
  | "internal";

export const AppErrorCategories: ReadonlyArray<AppErrorCategory> = [
  "usage",
  "not_found",
  "auth",
  "forbidden",
  "conflict",
  "rate_limit",
  "network",
  "validation",
  "internal",
];

export const exitCodeForCategory = (category: AppErrorCategory): number => {
  switch (category) {
    case "usage":
      return 2;
    case "not_found":
      return 3;
    case "auth":
      return 4;
    case "forbidden":
      return 5;
    case "conflict":
      return 6;
    case "rate_limit":
      return 7;
    case "network":
      return 8;
    case "validation":
      return 9;
    case "internal":
      return 1;
  }
};

export class AppError extends Data.TaggedError("AppError")<{
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly reason?: string;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause: unknown;
}> {}

export const makeAppError = (args: {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly reason?: string;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly cause?: unknown;
}): AppError =>
  new AppError({
    code: args.code,
    category: args.category,
    message: args.message,
    ...(args.reason !== undefined ? { reason: args.reason } : {}),
    ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
    ...(args.httpStatus !== undefined ? { httpStatus: args.httpStatus } : {}),
    breadcrumbs:
      args.breadcrumbs !== undefined && args.breadcrumbs.length > 0
        ? args.breadcrumbs
        : args.category === "internal"
          ? []
          : [{ task: "Recover", description: "Review the message, adjust the input, and retry." }],
    cause: args.cause,
  });
