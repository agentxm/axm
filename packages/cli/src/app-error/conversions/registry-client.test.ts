/**
 * Golden-pair tests pinning the registry-client conversion byte-for-byte:
 * each recorded problem-details fixture travels the real translation path
 * (`registryErrorToProblem` → `toAppError`) and must produce exactly the
 * envelope the former in-registry `registryErrorToAppError` produced,
 * including rendered and machine channel output for the request-policy case.
 */

import { describe, expect, it } from "vitest";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { RegistryRequestFailed, registryErrorToProblem } from "@agentxm/registry-client";
import { renderAppError } from "../index.js";
import { makeJsonErrorEnvelopeFromAppError } from "../../cli-runtime/index.js";
import { toAppError } from "../conversions.js";

const responseFor = (status: number, headers?: Readonly<Record<string, string>>) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://registry.agentxm.ai/test"),
    new Response("", { status, ...(headers === undefined ? {} : { headers }) }),
  );

describe("registry-client failure conversion (golden pairs)", () => {
  it("preserves problem-supplied title/detail and full metadata for a 503", () => {
    const body = {
      title: "Advisory title",
      status: 400,
      detail: "The service is unavailable.",
      code: "service_unavailable",
      request_id: "req_mismatch",
    };
    const cause = new Error("generated failure");

    const error = toAppError(registryErrorToProblem(body, responseFor(503), { cause }));

    expect(error.code).toBe("unavailable");
    expect(error.title).toBe("Advisory title");
    expect(error.detail).toBe("The service is unavailable.");
    expect(error.metadata).toEqual({
      request: {
        service: "registry",
        method: "GET",
        url: "https://registry.agentxm.ai/test",
      },
      response: {
        status: 503,
        requestId: "req_mismatch",
        problemCode: "service_unavailable",
        body,
      },
    });
    expect(error.cause).toBe(cause);
  });

  it("applies the per-code default title and detail when the body is not a problem document", () => {
    const cause = new Error("response failure");
    const error = toAppError(
      registryErrorToProblem("gateway unavailable", responseFor(502), { cause }),
    );

    expect(error.code).toBe("internal");
    expect(error.title).toBe("Internal Error");
    expect(error.detail).toBe("An internal error occurred.");
    expect(error.metadata?.response).toEqual({ status: 502, body: "gateway unavailable" });
    expect(error.cause).toBe(cause);
  });

  it("carries retry-after suggestions from the header for a 429", () => {
    const error = toAppError(
      registryErrorToProblem(
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
      ),
    );

    expect(error.code).toBe("rate_limit");
    expect(error.title).toBe("Too Many Requests");
    expect(error.detail).toBe("Rate limited");
    expect(error.suggestions?.[0]?.description).toBe("Retry after 30s.");
  });

  it("carries scope suggestions for insufficient-scope 403 responses", () => {
    const error = toAppError(
      registryErrorToProblem(
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
      ),
    );

    expect(error.code).toBe("forbidden");
    expect(error.suggestions).toContainEqual({
      description: "Sign in with the required registry scope.",
      cmd: "axm login --scope extensions:publish:version",
    });
  });

  it("carries lint finding suggestions for publish lint responses", () => {
    const error = toAppError(
      registryErrorToProblem(
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
      ),
    );

    expect(error.code).toBe("validation");
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "Publish lint failed with 1 finding.",
    );
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "error: skill/manifest-schema-valid - Manifest is invalid (skill.json)",
    );
  });

  it("renders the request-policy timeout failure through the typed error view", () => {
    const requestMetadata = {
      service: "registry",
      method: "GET",
      url: "https://registry.agentxm.ai/v1/extensions",
    } as const;
    const error = toAppError(
      new RegistryRequestFailed({
        category: "timeout",
        detail: "Registry request did not complete within the configured deadline.",
        metadata: {
          request: requestMetadata,
          requestPolicy: {
            retryable: true,
            attemptCount: 1,
            maxAttempts: 1,
            exhausted: true,
            stoppedBy: "replay-unsafe",
            replaySafety: "mutation",
          },
        },
        cause: new Error("timeout"),
      }),
    );

    expect(error.code).toBe("timeout");
    expect(error.title).toBe("Timed Out");
    expect(renderAppError(error)).toBe(
      [
        "✖ Registry request did not complete within the configured deadline. (timeout)",
        "  Registry:  https://registry.agentxm.ai",
        "  Run with `--debug` to see error details.",
      ].join("\n"),
    );
    expect(makeJsonErrorEnvelopeFromAppError(error)).toMatchObject({
      ok: false,
      code: "timeout",
      title: "Timed Out",
      detail: "Registry request did not complete within the configured deadline.",
      metadata: { request: requestMetadata },
    });
  });
});
