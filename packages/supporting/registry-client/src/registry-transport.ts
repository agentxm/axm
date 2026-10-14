/**
 * The transport a Registry request travels on.
 *
 * Registry requests use their own client, never the process-wide one: the
 * composition root supplies it with redirects left unfollowed, and every
 * Registry client built here refuses a redirect instead of replaying the
 * request — and any credential it carries — somewhere else. A credential is
 * attached only by the authorization the composition root provides, and only
 * to a request that stays at the Registry origin it was bound for.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type { HttpRegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { RegistryRequestFailed } from "./errors.js";

/**
 * The plain Registry transport: no credentials, redirects left to the caller.
 * Token exchange, refresh, and revocation use it directly; every other
 * Registry request reaches it through an authorized client.
 *
 * The composition root must provide a client built with `redirect: "manual"`
 * so a redirect answer reaches {@link refuseRegistryRedirects} as a 3xx
 * response instead of being followed underneath it.
 */
export class RegistryHttpClient extends ServiceMap.Service<
  RegistryHttpClient,
  HttpClient.HttpClient
>()("@agentxm/registry-client/registry-transport/RegistryHttpClient") {}

/**
 * How a request to one Registry acquires its credential. The Registry access
 * capability provides it; the client factory applies it to the transport of
 * every client it builds for an HTTP(S) Registry.
 */
export interface RegistryRequestAuthorizationService {
  readonly authorize: (
    endpoint: HttpRegistryEndpoint,
    client: HttpClient.HttpClient,
  ) => HttpClient.HttpClient;
}

export class RegistryRequestAuthorization extends ServiceMap.Service<
  RegistryRequestAuthorization,
  RegistryRequestAuthorizationService
>()("@agentxm/registry-client/registry-transport/RegistryRequestAuthorization") {}

const requestOrigin = (request: HttpClientRequest.HttpClientRequest): string | undefined =>
  URL.canParse(request.url) ? new URL(request.url).origin : undefined;

const refused = (request: HttpClientRequest.HttpClientRequest, failure: RegistryRequestFailed) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request,
      cause: failure,
      description: failure.detail,
    }),
  });

/**
 * Refuse any request that would leave the Registry origin it was bound for,
 * before it is dispatched.
 */
const confineToRegistryOrigin = (
  endpoint: HttpRegistryEndpoint,
  client: HttpClient.HttpClient,
): HttpClient.HttpClient =>
  HttpClient.make((request) => {
    const origin = requestOrigin(request);
    if (origin === endpoint.href) return client.execute(request);
    return Effect.fail(
      refused(
        request,
        new RegistryRequestFailed({
          reason: "request-construction",
          category: "validation",
          detail: `A request for the Registry at ${endpoint.href} was addressed to ${origin ?? "an invalid URL"}; it was not sent.`,
          metadata: {
            request: { service: "registry", method: request.method, url: endpoint.href },
          },
        }),
      ),
    );
  });

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Refuse a redirect answer. Nothing is replayed: a Registry is configured at
 * the endpoint that serves it, and a request is never re-sent — with or
 * without its credential — to wherever a response points.
 */
export const refuseRegistryRedirects = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, (response) =>
    Effect.flatMap(response, (answer) => {
      if (!REDIRECT_STATUSES.has(answer.status)) return Effect.succeed(answer);
      const location = answer.headers["location"];
      const target =
        location !== undefined && URL.canParse(location, answer.request.url)
          ? new URL(location, answer.request.url).origin
          : "an unspecified location";
      return Effect.fail(
        refused(
          answer.request,
          new RegistryRequestFailed({
            reason: "transport",
            category: "validation",
            detail: `The Registry redirected ${answer.request.method} ${new URL(answer.request.url).pathname} to ${target}; AXM does not follow Registry redirects.`,
            metadata: {
              request: {
                service: "registry",
                method: answer.request.method,
                url: answer.request.url,
              },
              response: { status: answer.status },
            },
            suggestions: [
              {
                description:
                  "Configure the Registry at the origin that serves it rather than one that redirects.",
              },
            ],
          }),
        ),
      );
    }),
  );

/**
 * The plain transport one HTTP(S) Registry is reached on: confined to its
 * origin and refusing redirects, carrying no credential of its own. Every
 * Registry client is built over it; token exchange, refresh, and revocation
 * use it as it is.
 */
export const registryWire = (
  endpoint: HttpRegistryEndpoint,
  client: HttpClient.HttpClient,
): HttpClient.HttpClient => confineToRegistryOrigin(endpoint, refuseRegistryRedirects(client));
