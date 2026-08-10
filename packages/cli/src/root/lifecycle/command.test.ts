import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestMachineRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";

import { expectAppliedPlanResult, expectRecord, property } from "../../test-helpers.js";
import { handleDeprecate, handleUndeprecate, handleUnyank, handleYank } from "./command.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const EXTENSION = "@acme/skills/review";
const VERSIONED_EXTENSION = `${EXTENSION}@1.2.3`;
const ALICE = normalizeHandle("@alice");

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const lifecycleSuccessBody = (url: string, method: string): unknown => {
  if (url.endsWith("/versions/yank")) {
    return {
      selection: "all-available",
      affectedVersions: ["1.0.0", "1.2.3"],
      futureVersionsAffected: false,
    };
  }
  if (url.endsWith("/deprecate")) {
    return {
      owner: "@acme",
      type: "skill",
      name: "review",
      deprecatedAt: method === "DELETE" ? null : "2026-07-29T00:00:00.000Z",
      deprecationNotice: method === "DELETE" ? null : "Use the replacement.",
    };
  }
  return {
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.2.3",
    yankedAt: method === "DELETE" ? null : "2026-07-29T00:00:00.000Z",
    yankCategory: method === "DELETE" ? null : "security",
    yankNotice: method === "DELETE" ? null : "Unsafe release.",
    links: { html: "https://agentxm.ai/@acme/skills/review/1.2.3" },
  };
};

const makeLayers = (options?: { readonly stepUp?: boolean; readonly unauthorized?: boolean }) => {
  const renderer = TestMachineRenderer.make();
  const interaction = AuthLoginInteractionTest({
    openBrowser: () => Effect.succeed(true),
  });
  const requests: Array<{
    readonly url: string;
    readonly method: string;
    readonly stepUpRequest?: string;
  }> = [];
  let challengeSent = false;
  const httpClient = HttpClient.make((request) =>
    Effect.sync(() => {
      const stepUpRequest = request.headers["x-axm-step-up-request"];
      requests.push({
        url: request.url,
        method: request.method,
        ...(stepUpRequest === undefined ? {} : { stepUpRequest }),
      });
      if (options?.unauthorized === true) {
        return HttpClientResponse.fromWeb(
          request,
          jsonResponse(
            {
              type: "https://agentxm.ai/problems/auth",
              title: "Unauthorized",
              status: 401,
              detail: "Authentication required",
              code: "auth",
            },
            401,
          ),
        );
      }
      if (options?.stepUp === true && !challengeSent) {
        challengeSent = true;
        return HttpClientResponse.fromWeb(
          request,
          jsonResponse(
            {
              kind: "StepUpRequiredError",
              type: "https://agentxm.ai/problems/step-up",
              title: "Step-up required",
              status: 401,
              detail: "Complete step-up authentication",
              code: "eotp",
              max_age: 300,
              step_up: {
                request_id: "step_01h455vb4pexka56gq5w2r7cpc",
                verification_url: "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
                status_url: `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
                expires_at: "2026-08-10T16:05:00.000Z",
                interval: 2,
                action: "Yank extension version",
                target: VERSIONED_EXTENSION,
              },
            },
            401,
          ),
        );
      }
      return HttpClientResponse.fromWeb(
        request,
        jsonResponse(lifecycleSuccessBody(request.url, request.method)),
      );
    }),
  );

  const credentials = CredentialStoreTest("restricted-file", {
    version: 1,
    registries: {
      [REGISTRY_URL]: {
        accounts: {
          [ALICE]: {
            access_token: "axm_ses_lifecycle",
            refresh_token: "axm_ref_lifecycle",
            expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
            active: true,
          },
        },
      },
    },
  });

  const layer = Layer.mergeAll(
    renderer.layer,
    TestFlagsLayer({ json: true }),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(RegistryUrl, REGISTRY_URL),
    credentials,
    AuthClientTest({ waitForStepUpRequest: () => Effect.void }),
    interaction.layer,
  );

  return {
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(layer)),
    rendererState: renderer.state,
    interactionState: interaction.state,
    requests,
  };
};

describe("extension lifecycle machine output", () => {
  it.effect("emits one plan result for yank", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleYank({
          ref: VERSIONED_EXTENSION,
          allVersions: false,
          category: Option.some("security"),
          notice: Option.some("Unsafe release."),
        });

        expect(rendererState.results).toHaveLength(1);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Yank extension version",
        });
      }),
    );
  });

  it.effect("emits one plan result for all-version yank", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleYank({
          ref: EXTENSION,
          allVersions: true,
          category: Option.none(),
          notice: Option.none(),
        });

        expect(rendererState.results).toHaveLength(1);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Yank available extension versions",
        });
        const steps = property(result, "steps");
        expect(Array.isArray(steps)).toBe(true);
        if (!Array.isArray(steps)) return;
        expect(property(expectRecord(steps[0]), "message")).toContain("2 available versions");
      }),
    );
  });

  it.effect("emits one plan result for unyank", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleUnyank(VERSIONED_EXTENSION);
        expect(rendererState.results).toHaveLength(1);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Un-yank extension version",
        });
      }),
    );
  });

  it.effect("emits one plan result for deprecate", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleDeprecate({ ref: EXTENSION, message: "Use the replacement." });
        expect(rendererState.results).toHaveLength(1);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Deprecate extension",
          warningCount: 1,
        });
      }),
    );
  });

  it.effect("emits one plan result for undeprecate", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleUndeprecate(EXTENSION);
        expect(rendererState.results).toHaveLength(1);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Undeprecate extension",
        });
      }),
    );
  });

  it.effect("completes step-up and retries a yank without machine progress narration", () => {
    const { provide, rendererState, interactionState, requests } = makeLayers({ stepUp: true });
    return provide(
      Effect.gen(function* () {
        yield* handleYank({
          ref: VERSIONED_EXTENSION,
          allVersions: false,
          category: Option.none(),
          notice: Option.none(),
        });

        expect(interactionState.openBrowserCalls).toEqual([]);
        expect(requests).toHaveLength(2);
        expect(requests[0]?.stepUpRequest).toBeUndefined();
        expect(requests[1]?.stepUpRequest).toBe("step_01h455vb4pexka56gq5w2r7cpc");
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.logs).toEqual(
          expect.arrayContaining([
            { _tag: "info", message: `Action: Yank extension version` },
            { _tag: "info", message: `Target: ${VERSIONED_EXTENSION}` },
            {
              _tag: "info",
              message: "Verify at: https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
            },
          ]),
        );
      }),
    );
  });

  it.effect("preserves the auth error contract for lifecycle failures", () => {
    const { provide } = makeLayers({ unauthorized: true });
    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(handleUndeprecate(EXTENSION));
        expect(error).toMatchObject({ _tag: "AppError", code: "auth" });
      }),
    );
  });
});
