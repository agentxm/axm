import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { make } from "./__generated__/registry-client.js";
import { httpStatusToCategory, registryClientErrorToProblem } from "./translate.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

const getStringArray = (
  record: Record<string, unknown>,
  key: string,
): ReadonlyArray<string> | undefined => {
  const value = record[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
};

const expectedCodeForStatus = (status: number, problemCode: string) => {
  if (
    status === 403 &&
    (problemCode === "quota_exceeded" || problemCode === "publish/quota-exceeded")
  ) {
    return "quota";
  }
  return httpStatusToCategory(status);
};

const statusForErrorSchema = (schemaName: string): number | undefined => {
  const normalizedName = schemaName.endsWith("Encoded")
    ? schemaName.slice(0, -"Encoded".length)
    : schemaName;
  switch (normalizedName) {
    case "InvalidRequestError":
      return 400;
    case "UnauthorizedError":
      return 401;
    case "ForbiddenError":
      return 403;
    case "NotFoundError":
      return 404;
    case "ConflictError":
      return 409;
    case "PayloadTooLargeError":
      return 413;
    case "UnsupportedMediaTypeError":
      return 415;
    case "UnprocessableEntityError":
    case "ExtensionIdentityMismatchError":
    case "ExtensionLintFailedError":
      return 422;
    case "TooManyRequestsError":
      return 429;
    case "InternalError":
      return 500;
    case "NotImplementedError":
      return 501;
    case "ServiceUnavailableError":
      return 503;
    default:
      return undefined;
  }
};

describe("registry OpenAPI error code contract", () => {
  it.effect("decodes an unavailable step-up read and preserves its problem details", () =>
    Effect.gen(function* () {
      const requests: Array<string> = [];
      const problem = {
        type: "https://registry.agentxm.ai/problems/service_unavailable",
        title: "Service Unavailable",
        status: 503,
        detail: "Recent-authentication verification is temporarily unavailable.",
        code: "service_unavailable",
      };
      const client = make(
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request.url);
            return HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify(problem), {
                status: 503,
                headers: { "content-type": "application/problem+json" },
              }),
            );
          }),
        ).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("https://registry.example.com"))),
      );
      const result = yield* client.AuthGetStepUpRequest("stup_01", undefined).pipe(Effect.result);
      expect(requests).toEqual(["https://registry.example.com/v1/auth/step-up/requests/stup_01"]);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isSuccess(result)) throw new Error("Expected an unavailable read.");
      expect(result.failure._tag).toBe("AuthGetStepUpRequest503");
      if (result.failure._tag !== "AuthGetStepUpRequest503") {
        throw new Error("Expected a declared Registry response.");
      }
      expect(result.failure.cause).toEqual(problem);
      const translated = registryClientErrorToProblem(result.failure);
      expect(translated.category).toBe("unavailable");
      expect(translated.detail).toBe(problem.detail);
    }),
  );

  it("maps every emitted Problem Details code enum through registry classification", () => {
    const openApiPath = path.join(process.cwd(), "specs/registry-openapi.json");
    const document: unknown = JSON.parse(fs.readFileSync(openApiPath, "utf8"));

    expect(isRecord(document)).toBe(true);
    if (!isRecord(document)) return;

    const components = getRecord(document, "components");
    const schemas = components === undefined ? undefined : getRecord(components, "schemas");

    expect(schemas).toBeDefined();
    if (schemas === undefined) return;

    const checked: Array<string> = [];

    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (!isRecord(schema)) continue;
      const status = statusForErrorSchema(schemaName);
      if (status === undefined) continue;

      const properties = getRecord(schema, "properties");
      const codeProperty = properties === undefined ? undefined : getRecord(properties, "code");
      const codes = codeProperty === undefined ? undefined : getStringArray(codeProperty, "enum");

      if (codes === undefined) continue;

      for (const code of codes) {
        const category = httpStatusToCategory(status, code);
        checked.push(`${schemaName} ${status} ${code}`);
        expect(category, `${schemaName} ${status} ${code}`).toBe(
          expectedCodeForStatus(status, code),
        );
        if (status < 500) {
          expect(category, `${schemaName} ${status} ${code}`).not.toBe("internal");
          expect(category, `${schemaName} ${status} ${code}`).not.toBe("network");
        }
      }
    }

    expect(checked.length).toBeGreaterThan(0);
  });
});
