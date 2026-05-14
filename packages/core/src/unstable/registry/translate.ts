import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import {
  type AppError,
  type AppErrorCode,
  defaultDetailFor,
  defaultTitleFor,
  makeAppError,
} from "../app-error/index.js";
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";
import {
  ExtensionIdentityMismatchError,
  ExtensionLintFailedError,
  ForbiddenError,
  ProblemDetails as RegistryProblemDetailsSchema,
  type RegistryClientError,
} from "./__generated__/registry-client.js";

export interface ProblemDetails {
  readonly [key: string]: unknown;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}

const EmptyProblem: ProblemDetails = {};

const isProblemDetails = (value: unknown): value is ProblemDetails =>
  typeof value === "object" && value !== null;

const decodeForbiddenError = Schema.decodeUnknownSync(ForbiddenError);
const decodeRegistryProblemDetails = Schema.decodeUnknownSync(RegistryProblemDetailsSchema);
const decodeExtensionLintFailedError = Schema.decodeUnknownSync(ExtensionLintFailedError);
const decodeExtensionIdentityMismatchError = Schema.decodeUnknownSync(
  ExtensionIdentityMismatchError,
);

const tryDecode = <A>(decode: (input: unknown) => A, input: unknown): A | undefined => {
  try {
    return decode(input);
  } catch {
    return undefined;
  }
};

export const httpStatusToAppCode = (status: number, code?: string): AppErrorCode => {
  switch (status) {
    case 400:
      return "validation";
    case 401:
      return "auth";
    case 403:
      return code === "quota_exceeded" || code === "publish/quota-exceeded" ? "quota" : "forbidden";
    case 404:
    case 410:
      return "not_found";
    case 409:
    case 412:
      return "conflict";
    case 413:
    case 415:
    case 422:
      return "validation";
    case 429:
      return "rate_limit";
    case 500:
    case 501:
    case 502:
      return "internal";
    case 503:
      return "unavailable";
    default:
      return status >= 500 ? "internal" : "internal";
  }
};

const parseRetryAfterHeader = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }

  return undefined;
};

const retryAfterFromBody = (status: number, body: unknown): number | undefined => {
  if (status === 429 || status === 503) {
    return tryDecode(decodeRegistryProblemDetails, body)?.details?.retryAfterSeconds;
  }
  return undefined;
};

const retryAfterBreadcrumb = (
  status: number,
  body: unknown,
  response: HttpClientResponse.HttpClientResponse,
): Breadcrumb | undefined => {
  const headerSeconds =
    parseRetryAfterHeader(response.headers["retry-after"]) ??
    parseRetryAfterHeader(response.headers["Retry-After"]);
  const retryAfterSeconds = headerSeconds ?? retryAfterFromBody(status, body);

  return retryAfterSeconds === undefined
    ? undefined
    : { description: `Retry after ${String(retryAfterSeconds)}s.` };
};

const scopeDeniedBreadcrumb = (body: unknown): Breadcrumb | undefined => {
  const decoded = tryDecode(decodeForbiddenError, body);
  const requiredScope =
    decoded?.details !== undefined && "requiredScope" in decoded.details
      ? decoded.details.requiredScope
      : undefined;

  return requiredScope === undefined
    ? undefined
    : { description: `Re-authenticate with --scope ${requiredScope}.` };
};

const lintFailedBreadcrumbs = (body: unknown): ReadonlyArray<Breadcrumb> => {
  const decoded = tryDecode(decodeExtensionLintFailedError, body);
  if (decoded === undefined) return [];

  const findingCount = decoded.findings.length;
  const findingLabel = findingCount === 1 ? "finding" : "findings";
  const summary: Breadcrumb = {
    description: `Publish lint failed with ${String(findingCount)} ${findingLabel}.`,
  };
  const findings = decoded.findings.slice(0, 5).map((finding) => ({
    description: `${finding.severity}: ${finding.ruleId} - ${finding.message} (${finding.path})`,
  }));

  return [summary, ...findings];
};

const identityMismatchBreadcrumbs = (body: unknown): ReadonlyArray<Breadcrumb> => {
  const decoded = tryDecode(decodeExtensionIdentityMismatchError, body);
  if (decoded === undefined) return [];

  const summary: Breadcrumb = {
    description: `Publish identity mismatch on ${String(decoded.mismatches.length)} field${decoded.mismatches.length === 1 ? "" : "s"}.`,
  };
  const mismatches = decoded.mismatches.map((mismatch) => ({
    description: `${mismatch.field}: URL has ${mismatch.urlPath ?? "<missing>"}, archive has ${mismatch.content ?? "<missing>"}.`,
  }));

  return [summary, ...mismatches];
};

const problemBreadcrumbs = (
  status: number,
  problem: ProblemDetails,
  response: HttpClientResponse.HttpClientResponse,
): ReadonlyArray<Breadcrumb> => {
  const body = problem;
  const retry = retryAfterBreadcrumb(status, body, response);
  const scope = status === 403 ? scopeDeniedBreadcrumb(body) : undefined;
  return [
    ...(retry === undefined ? [] : [retry]),
    ...(scope === undefined ? [] : [scope]),
    ...(status === 422 && problem.code === "extension_lint_failed"
      ? lintFailedBreadcrumbs(body)
      : []),
    ...(status === 422 && problem.code === "extension_identity_mismatch"
      ? identityMismatchBreadcrumbs(body)
      : []),
  ];
};

export const registryErrorToAppError = (
  problem: ProblemDetails,
  response: HttpClientResponse.HttpClientResponse,
  ctx?: {
    readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  },
): AppError => {
  const status = problem.status ?? response.status;
  const code = httpStatusToAppCode(status, problem.code);
  const breadcrumbs = [
    ...problemBreadcrumbs(status, problem, response),
    ...(ctx?.breadcrumbs ?? []),
  ];

  return makeAppError({
    code,
    title: problem.title ?? defaultTitleFor(code),
    detail: problem.detail ?? defaultDetailFor(code),
    metadata: { response: { status, body: problem } },
    ...(breadcrumbs.length > 0 ? { breadcrumbs } : {}),
    cause: problem,
  });
};

export const registryClientErrorToAppError = (
  error: RegistryClientError<string, unknown>,
  ctx?: {
    readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  },
): AppError =>
  registryErrorToAppError(
    isProblemDetails(error.cause) ? error.cause : EmptyProblem,
    error.response,
    ctx,
  );
