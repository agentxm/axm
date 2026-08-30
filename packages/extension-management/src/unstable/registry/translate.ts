import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import {
  type AppError,
  type AppErrorCode,
  defaultDetailFor,
  defaultTitleFor,
  makeAppError,
} from "../app-error/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  ExtensionIdentityMismatchErrorEncoded,
  ExtensionLintFailedErrorEncoded,
  ForbiddenErrorEncoded,
  type RegistryClientError,
} from "./__generated__/registry-client.js";
import { registryRetryAfterSeconds } from "./retry-after.js";
import { retainedRegistryResponseBody } from "./response-body.js";

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

const decodeForbiddenError = Schema.decodeUnknownSync(ForbiddenErrorEncoded);
const decodeExtensionLintFailedError = Schema.decodeUnknownSync(ExtensionLintFailedErrorEncoded);
const decodeExtensionIdentityMismatchError = Schema.decodeUnknownSync(
  ExtensionIdentityMismatchErrorEncoded,
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

const retryAfterSuggestedAction = (
  status: number,
  body: unknown,
  response: HttpClientResponse.HttpClientResponse,
): SuggestedAction | undefined => {
  const retryAfterSeconds = registryRetryAfterSeconds({
    status,
    body,
    response,
    nowMillis: DateTime.toEpochMillis(DateTime.nowUnsafe()),
  });

  return retryAfterSeconds === undefined
    ? undefined
    : { description: `Retry after ${String(retryAfterSeconds)}s.` };
};

const scopeDeniedSuggestedAction = (body: unknown): SuggestedAction | undefined => {
  const decoded = tryDecode(decodeForbiddenError, body);
  const requiredScope =
    decoded?.details !== undefined && "requiredScope" in decoded.details
      ? decoded.details.requiredScope
      : undefined;

  return requiredScope === undefined
    ? undefined
    : {
        description: "Sign in with the required registry scope.",
        cmd: `axm login --scope ${requiredScope}`,
      };
};

const lintFailedSuggestions = (body: unknown): ReadonlyArray<SuggestedAction> => {
  const decoded = tryDecode(decodeExtensionLintFailedError, body);
  if (decoded === undefined) return [];

  const findingCount = decoded.findings.length;
  const findingLabel = findingCount === 1 ? "finding" : "findings";
  const summary: SuggestedAction = {
    description: `Publish lint failed with ${String(findingCount)} ${findingLabel}.`,
  };
  const findings = decoded.findings.slice(0, 5).map((finding) => ({
    description: `${finding.severity}: ${finding.ruleId} - ${finding.message} (${finding.path})`,
  }));
  const suppressedCount = findingCount - findings.length;
  const suppressed =
    suppressedCount === 0
      ? []
      : [
          {
            description: `${String(suppressedCount)} additional ${suppressedCount === 1 ? "finding was" : "findings were"} suppressed.`,
          },
        ];

  return [summary, ...findings, ...suppressed];
};

const identityMismatchSuggestions = (body: unknown): ReadonlyArray<SuggestedAction> => {
  const decoded = tryDecode(decodeExtensionIdentityMismatchError, body);
  if (decoded === undefined) return [];

  const summary: SuggestedAction = {
    description: `Publish identity mismatch on ${String(decoded.mismatches.length)} field${decoded.mismatches.length === 1 ? "" : "s"}.`,
  };
  const mismatches = decoded.mismatches.map((mismatch) => ({
    description: `${mismatch.field}: URL has ${mismatch.urlPath ?? "<missing>"}, archive has ${mismatch.content ?? "<missing>"}.`,
  }));

  return [summary, ...mismatches];
};

const serverErrorSuggestedAction = (status: number): SuggestedAction | undefined =>
  status >= 500
    ? {
        description:
          "The registry returned a server error. Retry shortly; if it persists, report it with the request ID.",
      }
    : undefined;

const getStringField = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

const problemSuggestions = (
  status: number,
  problem: ProblemDetails,
  response: HttpClientResponse.HttpClientResponse,
): ReadonlyArray<SuggestedAction> => {
  const body = problem;
  const retry = retryAfterSuggestedAction(status, body, response);
  const scope = status === 403 ? scopeDeniedSuggestedAction(body) : undefined;
  const serverError = serverErrorSuggestedAction(status);
  return [
    ...(retry === undefined ? [] : [retry]),
    ...(scope === undefined ? [] : [scope]),
    ...(serverError === undefined ? [] : [serverError]),
    ...(status === 422 && problem.code === "extension_lint_failed"
      ? lintFailedSuggestions(body)
      : []),
    ...(status === 422 && problem.code === "extension_identity_mismatch"
      ? identityMismatchSuggestions(body)
      : []),
  ];
};

export const registryErrorToAppError = (
  body: unknown,
  response: HttpClientResponse.HttpClientResponse,
  ctx?: {
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly cause?: unknown;
  },
): AppError => {
  const problem = isProblemDetails(body) ? body : EmptyProblem;
  const status = response.status;
  const code = httpStatusToAppCode(status, problem.code);
  const suggestions = [
    ...problemSuggestions(status, problem, response),
    ...(ctx?.suggestions ?? []),
  ];
  const requestId = getStringField(problem, "requestId") ?? getStringField(problem, "request_id");

  return makeAppError({
    code,
    title: problem.title ?? defaultTitleFor(code),
    detail: problem.detail ?? defaultDetailFor(code),
    metadata: {
      request: {
        service: "registry",
        method: response.request.method,
        url: response.request.url,
      },
      response: {
        status,
        ...(requestId === undefined ? {} : { requestId }),
        ...(problem.code === undefined ? {} : { problemCode: problem.code }),
        body,
      },
    },
    ...(suggestions.length > 0 ? { suggestions } : {}),
    cause: ctx?.cause ?? body,
  });
};

export const registryClientErrorToAppError = (
  error: RegistryClientError<string, unknown>,
  ctx?: {
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
  },
): AppError =>
  registryErrorToAppError(
    retainedRegistryResponseBody(error.response, error.cause),
    error.response,
    {
      ...(ctx?.suggestions === undefined ? {} : { suggestions: ctx.suggestions }),
      cause: error,
    },
  );
