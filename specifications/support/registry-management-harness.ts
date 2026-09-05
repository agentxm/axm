/** Production Registry adapters and command handlers over a recorded HTTP boundary. */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { authCredentialFile, authRegistry, makeAuthSpecContext } from "./auth-harness.js";

export const registryTarget = "@acme/skills/review";
export const registryVersion = `${registryTarget}@1.2.3`;
export const registryTargetPath = `/v1/extensions/${registryTarget}`;
export const observedRevision = "opaque-observed-revision";
export const stepUpRequestId = "step_01h455vb4pexka56gq5w2r7cpc";

export interface RegistryRequest {
  readonly method: string;
  readonly url: URL;
  readonly ifMatch: string | undefined;
  readonly stepUpRequest: string | undefined;
  readonly body: unknown;
}

export const jsonRegistryResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const registryProblem = (code: string, status: number) =>
  jsonRegistryResponse(
    {
      type: `https://agentxm.ai/problems/${code}`,
      title: "Request rejected",
      status,
      detail: "Synthetic Registry rejection",
      code,
    },
    status,
  );

export const stepUpChallenge = (target = registryVersion, action = "Yank extension version") =>
  jsonRegistryResponse(
    {
      kind: "StepUpRequiredError",
      type: "https://agentxm.ai/problems/step-up",
      title: "Step-up required",
      status: 401,
      detail: "Complete step-up authentication",
      code: "eotp",
      max_age: 300,
      step_up: {
        request_id: stepUpRequestId,
        verification_url: `https://agentxm.ai/step-up/${stepUpRequestId}`,
        status_url: `${authRegistry}/v1/auth/step-up/requests/${stepUpRequestId}`,
        expires_at: "2099-01-01T00:00:00.000Z",
        interval: 2,
        action,
        target,
      },
    },
    401,
  );

export const versionLifecycleResponse = (yanked: boolean) =>
  jsonRegistryResponse({
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.2.3",
    yankedAt: yanked ? "2026-07-29T00:00:00.000Z" : null,
    yankCategory: yanked ? "security" : null,
    yankNotice: yanked ? "Unsafe release." : null,
    links: { html: "https://agentxm.ai/@acme/skills/review/1.2.3" },
  });

export const makeRegistryManagementContext = (
  respond: (request: RegistryRequest, index: number) => Response,
  options: Parameters<typeof makeAuthSpecContext>[0] = {},
) => {
  const auth = makeAuthSpecContext({ credentials: authCredentialFile, ...options });
  const requests: RegistryRequest[] = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);
      for (const [key, value] of request.urlParams) url.searchParams.append(key, value);
      const observation: RegistryRequest = {
        method: request.method,
        url,
        ifMatch: request.headers["if-match"],
        stepUpRequest: request.headers["x-axm-step-up-request"],
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
      };
      requests.push(observation);
      return HttpClientResponse.fromWeb(request, respond(observation, requests.length - 1));
    }),
  );
  const layer = Layer.mergeAll(
    auth.layer,
    NodeServices.layer,
    Layer.succeed(HttpClient.HttpClient, client),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(layer));
  return { ...auth, requests, provide };
};
