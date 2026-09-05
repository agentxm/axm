import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-auth/testing";
/** Real publish preparation, loopback authorization, upload adapters and settlement over controlled Registry responses. */
import * as crypto from "node:crypto";
import * as NodeHttp from "node:http";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import {
  type CreatePublishAuthorizationRequestParams,
  GitDirectoryComparison,
  handleRootPublish,
  PublishResultSchema,
} from "axm.sh/specification-harness";
import { makeSpecWorkspace, type SpecWorkspaceOptions } from "./install-harness.js";
import { publishArgs, type RootPublishArgs } from "./publish-harness.js";
import { jsonRegistryResponse, registryProblem } from "./registry-management-harness.js";

export const remotePublicationRegistry = "https://registry.example.test";
export const publicationCondition = '"pv2-reviewed"';
export const publicationCapability = "SYNTHETIC_PUBLICATION_CAPABILITY";

export const makeRemotePublicationContext = (
  options: {
    readonly workspace?: SpecWorkspaceOptions;
    readonly upload?: (
      request: HttpClientRequest.HttpClientRequest,
      index: number,
      success: (request: HttpClientRequest.HttpClientRequest) => Response,
    ) => Effect.Effect<Response>;
    readonly beforeAuthorization?: Effect.Effect<void>;
  } = {},
) =>
  Effect.gen(function* () {
    const workspace = makeSpecWorkspace({
      ...options.workspace,
      machine: true,
      flags: { nonInteractive: false, json: true },
    });
    const callbacks = new Set<NodeHttp.ClientRequest>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const callbackErrors: Error[] = [];
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const timer of timers) clearTimeout(timer);
        for (const request of callbacks) request.destroy();
        workspace.cleanup();
      }),
    );
    let authorizationRequest: CreatePublishAuthorizationRequestParams | undefined;
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const uploads: HttpClientRequest.HttpClientRequest[] = [];
    const authorized = () => {
      if (authorizationRequest === undefined)
        throw new Error("Expected a publication authorization request");
      return authorizationRequest;
    };
    const visibility = { value: "private", disposition: "establish", source: "explicit" } as const;
    const auth = AuthClientTest({
      createPublishAuthorizationRequest: (request) =>
        Effect.gen(function* () {
          authorizationRequest = request;
          if (options.beforeAuthorization !== undefined) yield* options.beforeAuthorization;
          return {
            requestId: "pubreq_specification",
            authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_specification",
            expiresAt: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
          };
        }),
      exchangePublishAuthorizationCode: () =>
        Effect.sync(() => {
          const candidates = authorized().publicationSet.candidates;
          const setDigest = publicationSetDigest(candidates);
          return {
            status: "admitted" as const,
            preview: {
              contract: "publication-set-v2" as const,
              publicationSetDigest: setDigest,
              status: "admitted" as const,
              candidates: candidates.map((candidate) => ({
                kind: "resolved" as const,
                target: candidate.target,
                participation: candidate.participation,
                descriptorDigest: publicationDescriptorDigest(candidate),
                visibility: {
                  target: formatFqn(candidate.target),
                  intent: candidate.visibility.intent,
                  request: candidate.visibility.request,
                  resolved: visibility,
                  actual: null,
                  comparison: "not-established" as const,
                  findings: [],
                },
                condition: publicationCondition,
              })),
              packs: candidates.flatMap((candidate) =>
                candidate.pack === undefined
                  ? []
                  : [
                      {
                        target: candidate.target,
                        status: "admitted" as const,
                        findings: [],
                        resolutions: candidate.pack.dependencies.map((dependency) => {
                          const selected = candidates.find(
                            (item) => formatFqn(item.target) === formatFqn(dependency),
                          );
                          if (selected === undefined)
                            throw new Error(
                              "Remote publication fixture requires an authored selected dependency",
                            );
                          return { dependency, effectiveVersion: selected.target.version };
                        }),
                      },
                    ],
              ),
            },
            grants: candidates
              .filter((candidate) => candidate.participation === "publish")
              .map((candidate) => ({
                accessToken: publicationCapability,
                expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
                scope: "extensions:publish:new",
                publishRequestId: "pubreq_specification",
                visibilityContract: "v2" as const,
                visibility,
                condition: publicationCondition,
                publicationSetDigest: setDigest,
                publicationDescriptorDigest: publicationDescriptorDigest(candidate),
              })),
          };
        }),
    });
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          const request = authorized();
          const callback = new URL(request.redirectUri);
          callback.searchParams.set("code", "SYNTHETIC_PUBLISH_CALLBACK_CODE");
          callback.searchParams.set("state", request.state);
          callback.searchParams.set("iss", "https://agentxm.ai");
          const timer = setTimeout(() => {
            timers.delete(timer);
            const connection = NodeHttp.get(callback, (response) => response.resume());
            callbacks.add(connection);
            connection.on("close", () => callbacks.delete(connection));
            connection.on("error", (error) => callbackErrors.push(error));
          }, 10);
          timers.add(timer);
          return true;
        }),
    });
    const success = (request: HttpClientRequest.HttpClientRequest) => {
      const url = Option.getOrThrow(HttpClientRequest.toUrl(request));
      const candidate = authorized().publicationSet.candidates.find((candidate) =>
        url.pathname.endsWith(`/${candidate.target.name}/${candidate.target.version}`),
      );
      if (candidate === undefined || request.body._tag !== "Uint8Array")
        throw new Error("Expected an authorized archive upload");
      return jsonRegistryResponse(
        {
          ...candidate.target,
          integrity: `sha512-${crypto.createHash("sha512").update(request.body.body).digest("base64")}`,
          sha256_hex: crypto.createHash("sha256").update(request.body.body).digest("hex"),
          published_at: "2026-08-11T00:00:00.000Z",
          publish_status: "available",
          visibility,
          warnings: [],
          links: { html: `https://agentxm.ai/${formatFqn(candidate.target)}` },
        },
        201,
      );
    };
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        requests.push(request);
        let response: Response;
        if (request.method === "PUT") {
          uploads.push(request);
          response =
            options.upload === undefined
              ? success(request)
              : yield* options.upload(request, uploads.length - 1, success);
        } else if (request.method === "GET" && new URL(request.url).pathname === "/v1/owners/@acme")
          response = jsonRegistryResponse({ displayName: "Acme" });
        else response = registryProblem("not_found", 404);
        return HttpClientResponse.fromWeb(request, response);
      }),
    );
    const layer = Layer.mergeAll(
      workspace.layer,
      auth,
      interaction.layer,
      Layer.succeed(HttpClient.HttpClient, client),
      Layer.succeed(GitDirectoryComparison, { compare: () => Effect.succeed(Option.none()) }),
    );
    const run = (overrides: Partial<RootPublishArgs> = {}) =>
      handleRootPublish(
        publishArgs(remotePublicationRegistry, {
          preview: false,
          visibility: Option.some("private"),
          ...overrides,
        }),
      ).pipe(Effect.provide(layer));
    return {
      workspace,
      run,
      requests,
      uploads,
      authorized,
      success,
      callbackErrors,
      result: () =>
        Schema.decodeUnknownEffect(PublishResultSchema)(
          workspace.rendererState.results.at(-1)?.data,
        ),
    };
  });
