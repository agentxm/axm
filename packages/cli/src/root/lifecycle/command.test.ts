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
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
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

const lifecycleSuccessBody = (
  url: string,
  method: string,
  currentDeprecation: unknown,
): unknown => {
  if (url.endsWith("/versions/yank")) {
    return {
      selection: "all-available",
      affectedVersions: ["1.0.0", "1.2.3"],
      futureVersionsAffected: false,
    };
  }
  if (url.endsWith("/deprecation")) {
    if (method === "GET") {
      return {
        deprecation: currentDeprecation,
        revision: "dep_0",
      };
    }
    if (method === "DELETE") {
      return {
        target: EXTENSION,
        before: {
          deprecatedAt: "2026-07-29T00:00:00.000Z",
          message: "Use the replacement.",
        },
        after: null,
        disposition: "restored",
        revision: "dep_2",
      };
    }
    return {
      target: EXTENSION,
      before: null,
      after: {
        deprecatedAt: "2026-07-29T00:00:00.000Z",
        message: "Use the replacement.",
      },
      disposition: "created",
      revision: "dep_1",
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

const makeLayers = (options?: {
  readonly stepUp?: boolean;
  readonly unauthorized?: boolean;
  readonly currentDeprecation?: unknown;
  readonly machine?: boolean;
}) => {
  const renderer = options?.machine === false ? TestRenderer.make() : TestMachineRenderer.make();
  const interaction = AuthLoginInteractionTest({
    openBrowser: () => Effect.succeed(true),
  });
  const requests: Array<{
    readonly url: string;
    readonly method: string;
    readonly stepUpRequest?: string;
    readonly ifMatch?: string;
    readonly body?: unknown;
  }> = [];
  let challengeSent = false;
  const httpClient = HttpClient.make((request) =>
    Effect.sync(() => {
      const stepUpRequest = request.headers["x-axm-step-up-request"];
      const ifMatch = request.headers["if-match"];
      const body: unknown =
        request.body._tag === "Uint8Array"
          ? JSON.parse(new TextDecoder().decode(request.body.body))
          : undefined;
      requests.push({
        url: request.url,
        method: request.method,
        ...(stepUpRequest === undefined ? {} : { stepUpRequest }),
        ...(ifMatch === undefined ? {} : { ifMatch }),
        ...(body === undefined ? {} : { body }),
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
        jsonResponse(
          lifecycleSuccessBody(request.url, request.method, options?.currentDeprecation ?? null),
        ),
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
    TestFlagsLayer({ json: options?.machine !== false }),
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

  it.effect("emits one Registry transition for deprecate", () => {
    const { provide, rendererState, requests } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleDeprecate({
          ref: EXTENSION,
          message: Option.some("Use the replacement."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        });
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          target: EXTENSION,
          before: null,
          disposition: "created",
          revision: "dep_1",
        });
        expect(requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
        expect(requests[1]).toMatchObject({
          ifMatch: "dep_0",
          body: {
            message: "Use the replacement.",
            replacement: { kind: "clear" },
          },
        });
      }),
    );
  });

  it.effect("emits one Registry transition for undeprecate", () => {
    const { provide, rendererState, requests } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleUndeprecate(EXTENSION);
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          target: EXTENSION,
          after: null,
          disposition: "restored",
          revision: "dep_2",
        });
        expect(requests.map(({ method }) => method)).toEqual(["GET", "DELETE"]);
        expect(requests[1]?.ifMatch).toBe("dep_0");
      }),
    );
  });

  it.effect("renders publisher guidance as human result data rather than a warning", () => {
    const { provide, rendererState } = makeLayers({ machine: false });
    return provide(
      Effect.gen(function* () {
        yield* handleDeprecate({
          ref: EXTENSION,
          message: Option.some("Use the replacement."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        });
        expect(rendererState.logs).toEqual(
          expect.arrayContaining([
            { _tag: "success", message: `Deprecated ${EXTENSION}.` },
            { _tag: "info", message: "Message: Use the replacement." },
          ]),
        );
        expect(rendererState.logs).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ _tag: "warn" })]),
        );
      }),
    );
  });

  it.effect("composes replacement-only guidance into a conditional PUT", () => {
    const { provide, requests } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleDeprecate({
          ref: EXTENSION,
          message: Option.none(),
          replacement: Option.some("@acme/skills/replacement"),
          clearMessage: false,
          clearReplacement: false,
        });
        expect(requests[1]).toMatchObject({
          ifMatch: "dep_0",
          body: {
            message: null,
            replacement: { kind: "set", fqn: "@acme/skills/replacement" },
          },
        });
      }),
    );
  });

  it.effect("preserves a concealed replacement at the observed revision", () => {
    const { provide, requests } = makeLayers({
      currentDeprecation: {
        deprecatedAt: "2026-07-29T00:00:00.000Z",
        message: "Old guidance.",
        replacement: { status: "unavailable" },
      },
    });
    return provide(
      Effect.gen(function* () {
        yield* handleDeprecate({
          ref: EXTENSION,
          message: Option.some("New guidance."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        });
        expect(requests[1]).toMatchObject({
          ifMatch: "dep_0",
          body: { message: "New guidance.", replacement: { kind: "preserve" } },
        });
      }),
    );
  });

  it.effect("rejects conflicting patch flags before making a request", () => {
    const { provide, requests } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleDeprecate({
            ref: EXTENSION,
            message: Option.some("Guidance."),
            replacement: Option.none(),
            clearMessage: true,
            clearReplacement: false,
          }),
        );
        expect(error).toMatchObject({ code: "validation" });
        expect(requests).toEqual([]);
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
