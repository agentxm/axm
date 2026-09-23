import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  ExtensionIdentityMismatchErrorEncoded,
  ExtensionLintFailedErrorEncoded,
  type ForbiddenErrorEncoded,
  type RegistryClientError,
} from "./__generated__/registry-client.js";
import { RegistryProblem, type RegistryErrorCategory } from "./errors.js";
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

const getStringField = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

export const httpStatusToCategory = (status: number, code?: string): RegistryErrorCategory => {
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
  nowMillis?: number,
): SuggestedAction | undefined => {
  const retryAfterSeconds = registryRetryAfterSeconds({
    status,
    body,
    response,
    ...(nowMillis === undefined ? {} : { nowMillis }),
  });

  return retryAfterSeconds === undefined
    ? undefined
    : { description: `Retry after ${String(retryAfterSeconds)}s.` };
};

/** The credential kinds a `credential_not_admitted` refusal says it would accept. */
const admittedCredentials = (body: unknown): ReadonlyArray<string> => {
  if (typeof body !== "object" || body === null) return [];
  const details: unknown = Reflect.get(body, "details");
  if (typeof details !== "object" || details === null) return [];
  const admitted: unknown = Reflect.get(details, "admittedCredentials");
  return Array.isArray(admitted)
    ? admitted.filter((kind): kind is string => typeof kind === "string")
    : [];
};

/**
 * An operation that does not admit the presented credential names the kinds it
 * does. A CLI session among them means the person already holds what it takes;
 * a browser session alone means the operation lives on the web. Neither is a
 * reason to sign in again.
 */
const credentialNotAdmittedRecovery = (body: unknown): SuggestedAction => {
  const admitted = admittedCredentials(body);
  if (admitted.includes("session")) {
    return {
      description:
        "This operation does not accept a token. Use your signed-in session: unset AXM_TOKEN and AXM_TOKEN_FILE, then rerun.",
    };
  }
  return admitted.includes("browser-session")
    ? { description: "Complete this one on the web.", url: "https://agentxm.ai" }
    : { description: "This credential may not perform this operation." };
};

/**
 * What a person can do about one forbidding rule.
 *
 * A 403 reaches a caller who is signed in, so no entry here suggests signing
 * in. A credential the person made narrower than themselves is pointed at the
 * session they already hold, never at a new one. Each code gets at most one
 * recovery, and a code this table does not know keeps the Registry's own title
 * and detail rather than inventing guidance for it.
 */
const FORBIDDEN_RECOVERIES: Partial<
  Record<ForbiddenErrorEncoded["code"], SuggestedAction | ((body: unknown) => SuggestedAction)>
> = {
  insufficient_scope: {
    description: "This credential is narrower than your account. Use your signed-in session.",
  },
  resource_restriction: {
    description: "This credential is restricted to other resources. Use your signed-in session.",
  },
  browser_session_required: {
    description: "Complete this one on the web.",
    url: "https://agentxm.ai",
  },
  credential_not_admitted: (body) => credentialNotAdmittedRecovery(body),
  identity_suspended: {
    description: "Contact support to restore this account.",
    url: "https://agentxm.ai/support",
  },
  staff_credential_required: { description: "This operation is restricted to AgentXM staff." },
  staff_role_required: { description: "Your staff role does not include this operation." },
  delegated_permission_not_held: {
    description: "Ask an owner of this resource for the permission this needs.",
  },
  "publish/handle-not-owned": {
    description: "Publish under a handle you own, or ask its owner to add you.",
  },
  "publish/insufficient-scope": {
    description: "This credential cannot publish. Use your signed-in session.",
  },
  "publish/resource-restriction": {
    description: "This credential is restricted to other extensions. Use your signed-in session.",
  },
  "publish/publish-forbidden": {
    description: "Ask an owner of this extension for publish permission.",
  },
};

const hasRecovery = (code: string): code is keyof typeof FORBIDDEN_RECOVERIES =>
  Object.hasOwn(FORBIDDEN_RECOVERIES, code);

/**
 * The recovery is keyed by the wire code alone, so a refusal whose details
 * this client cannot decode still gets the guidance its code deserves.
 */
const forbiddenSuggestedAction = (body: unknown): SuggestedAction | undefined => {
  const code = getStringField(body, "code");
  if (code === undefined || !hasRecovery(code)) return undefined;
  const recovery = FORBIDDEN_RECOVERIES[code];
  return typeof recovery === "function" ? recovery(body) : recovery;
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

/** Lifecycle refusals carry stable problem codes and bounded recovery. */
const lifecycleSuggestedAction = (problem: ProblemDetails): SuggestedAction | undefined => {
  if (problem.code === "extension_name_held") {
    return {
      description: "Contact support if access to this held extension is required.",
      url: "https://agentxm.ai/support",
    };
  }
  if (problem.code !== "lifecycle_blocked") return undefined;
  const reason = getStringField(problem, "reason");
  if (reason === "archived") {
    return {
      description: "Unarchive the extension with axm unarchive, then retry.",
    };
  }
  return reason === "held"
    ? {
        description: "Contact support if access to this held extension is required.",
        url: "https://agentxm.ai/support",
      }
    : undefined;
};

const problemSuggestions = (
  status: number,
  problem: ProblemDetails,
  response: HttpClientResponse.HttpClientResponse,
  nowMillis?: number,
): ReadonlyArray<SuggestedAction> => {
  const body = problem;
  const retry = retryAfterSuggestedAction(status, body, response, nowMillis);
  const forbidden = status === 403 ? forbiddenSuggestedAction(body) : undefined;
  const lifecycle = lifecycleSuggestedAction(body);
  const serverError = serverErrorSuggestedAction(status);
  return [
    ...(retry === undefined ? [] : [retry]),
    ...(forbidden === undefined ? [] : [forbidden]),
    ...(lifecycle === undefined ? [] : [lifecycle]),
    ...(serverError === undefined ? [] : [serverError]),
    ...(status === 422 && problem.code === "extension_lint_failed"
      ? lintFailedSuggestions(body)
      : []),
    ...(status === 422 && problem.code === "extension_identity_mismatch"
      ? identityMismatchSuggestions(body)
      : []),
  ];
};

export const registryErrorToProblem = (
  body: unknown,
  response: HttpClientResponse.HttpClientResponse,
  ctx?: {
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly cause?: unknown;
    readonly nowMillis?: number;
  },
): RegistryProblem => {
  const problem = isProblemDetails(body) ? body : EmptyProblem;
  const status = response.status;
  const category = httpStatusToCategory(status, problem.code);
  const suggestions = [
    ...problemSuggestions(status, problem, response, ctx?.nowMillis),
    ...(ctx?.suggestions ?? []),
  ];
  const requestId = getStringField(problem, "requestId") ?? getStringField(problem, "request_id");

  return new RegistryProblem({
    category,
    ...(problem.title === undefined ? {} : { title: problem.title }),
    ...(problem.detail === undefined ? {} : { detail: problem.detail }),
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

export const registryClientErrorToProblem = (
  error: RegistryClientError<string, unknown>,
  ctx?: {
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly nowMillis?: number;
  },
): RegistryProblem =>
  registryErrorToProblem(
    retainedRegistryResponseBody(error.response, error.cause),
    error.response,
    {
      ...(ctx?.suggestions === undefined ? {} : { suggestions: ctx.suggestions }),
      ...(ctx?.nowMillis === undefined ? {} : { nowMillis: ctx.nowMillis }),
      cause: error,
    },
  );
