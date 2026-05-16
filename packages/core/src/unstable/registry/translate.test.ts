import { describe, expect, it } from "vitest";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { httpStatusToAppCode, registryErrorToAppError } from "./translate.js";

const responseFor = (status: number, headers?: Readonly<Record<string, string>>) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://registry.agentxm.ai/test"),
    new Response("", { status, ...(headers === undefined ? {} : { headers }) }),
  );

describe("httpStatusToAppCode", () => {
  it.each([
    [400, undefined, "validation"],
    [401, undefined, "auth"],
    [403, undefined, "forbidden"],
    [403, "quota_exceeded", "quota"],
    [404, undefined, "not_found"],
    [409, undefined, "conflict"],
    [410, undefined, "not_found"],
    [412, undefined, "conflict"],
    [413, undefined, "validation"],
    [415, undefined, "validation"],
    [422, undefined, "validation"],
    [429, undefined, "rate_limit"],
    [500, undefined, "internal"],
    [501, undefined, "internal"],
    [502, undefined, "internal"],
    [503, undefined, "unavailable"],
    [599, undefined, "internal"],
    [302, undefined, "internal"],
  ])("maps HTTP %s with code %s to %s", (status, problemCode, appCode) => {
    expect(httpStatusToAppCode(status, problemCode)).toBe(appCode);
  });
});

describe("registryErrorToAppError", () => {
  it("adds retry-after suggestions from the header before the body", () => {
    const error = registryErrorToAppError(
      {
        kind: "TooManyRequestsError",
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Rate limited",
        code: "publish/throttled",
        details: { retryable: true, retryAfterSeconds: 60 },
      },
      responseFor(429, { "retry-after": "30" }),
    );

    expect(error.code).toBe("rate_limit");
    expect(error.suggestions?.[0]?.description).toBe("Retry after 30s.");
  });

  it("adds registry request and normalized response metadata", () => {
    const error = registryErrorToAppError(
      {
        kind: "InternalServerError",
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred.",
        code: "internal",
        requestId: "req_123",
      },
      responseFor(500),
    );

    expect(error.metadata).toEqual({
      request: {
        service: "registry",
        method: "GET",
        url: "https://registry.agentxm.ai/test",
      },
      response: {
        status: 500,
        requestId: "req_123",
        problemCode: "internal",
        body: {
          kind: "InternalServerError",
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          detail: "An unexpected error occurred.",
          code: "internal",
          requestId: "req_123",
        },
      },
    });
  });

  it("adds scope suggestions for insufficient-scope 403 responses", () => {
    const error = registryErrorToAppError(
      {
        kind: "ForbiddenError",
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "Token lacks required scope",
        code: "insufficient_scope",
        details: {
          requiredScope: "extensions:publish:version",
          grantedScopes: ["extensions:read"],
        },
      },
      responseFor(403),
    );

    expect(error.code).toBe("forbidden");
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "Re-authenticate with --scope extensions:publish:version.",
    );
  });

  it("adds lint finding suggestions for publish lint responses", () => {
    const error = registryErrorToAppError(
      {
        kind: "ExtensionLintFailedError",
        type: "about:blank",
        title: "Extension lint failed",
        status: 422,
        detail: "Lint failed",
        code: "extension_lint_failed",
        error: "extension_lint_failed",
        identity: {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        },
        displayRoot: ".",
        findings: [
          {
            kind: "advisory",
            ruleId: "skill/manifest-schema-valid",
            severity: "error",
            message: "Manifest is invalid",
            path: "skill.json",
            suggestions: [],
          },
        ],
      },
      responseFor(422),
    );

    expect(error.code).toBe("validation");
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "Publish lint failed with 1 finding.",
    );
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "error: skill/manifest-schema-valid - Manifest is invalid (skill.json)",
    );
  });

  it("adds identity mismatch suggestions for publish identity responses", () => {
    const error = registryErrorToAppError(
      {
        kind: "ExtensionIdentityMismatchError",
        type: "about:blank",
        title: "Extension identity mismatch",
        status: 422,
        detail: "Identity mismatch",
        code: "extension_identity_mismatch",
        error: "extension_identity_mismatch",
        identity: {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        },
        mismatches: [
          {
            field: "owner",
            urlPath: "@acme",
            content: "@other",
          },
        ],
      },
      responseFor(422),
    );

    expect(error.code).toBe("validation");
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "Publish identity mismatch on 1 field.",
    );
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "owner: URL has @acme, archive has @other.",
    );
  });
});
