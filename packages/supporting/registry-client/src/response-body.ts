import { RegistryRequestAttempt } from "./request-attempt.js";
import { validatedResponseRequestId } from "./request-identity.js";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { MAX_RESOLUTION_RESPONSE_BYTES } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

const decodeUnknownJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

const recoverBodyText = (text: string): unknown => {
  const decoded = decodeUnknownJson(text);
  return Option.isSome(decoded) ? decoded.value : text;
};

const retainedResponseBodyKey = Symbol("@agentxm/registry/retained-response-body");

// Fetch-backed responses do not honor HttpIncomingMessage.MaxBodySize. Bound
// selection/admission bytes while consuming the stream, before JSON decoding or
// error-body retention. Stream owns cancellation on overflow and interruption.
const boundResolutionBody = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* () {
    if (
      response.request.method !== "POST" ||
      new URL(response.request.url).pathname !== "/v1/resolutions"
    )
      return response;
    const bytes = new Uint8Array(MAX_RESOLUTION_RESPONSE_BYTES);
    const size = yield* Stream.runFoldEffect(
      response.stream,
      () => 0,
      (offset, chunk) => {
        if (chunk.byteLength > bytes.byteLength - offset)
          return Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.DecodeError({
                request: response.request,
                response,
                description: "Registry resolution response exceeds the encoded body limit",
              }),
            }),
          );
        bytes.set(chunk, offset);
        return Effect.succeed(offset + chunk.byteLength);
      },
    );
    return HttpClientResponse.fromWeb(
      response.request,
      new Response(bytes.slice(0, size), {
        status: response.status,
        headers: response.headers,
      }),
    );
  });

const retainResponseBody = (response: HttpClientResponse.HttpClientResponse) =>
  response.text.pipe(
    Effect.flatMap((text) =>
      Effect.sync(() => {
        Object.defineProperty(response, retainedResponseBodyKey, {
          configurable: false,
          enumerable: false,
          value: recoverBodyText(text),
          writable: false,
        });
        return response;
      }),
    ),
    Effect.catch(() => Effect.succeed(response)),
  );

/**
 * Capture non-success Registry response bodies before a generated or raw
 * endpoint adapter decodes them. HttpClientResponse caches the consumed bytes,
 * so the endpoint decoder still observes the same response.
 */
export const captureRegistryErrorResponseBodies = (
  client: HttpClient.HttpClient,
): HttpClient.HttpClient =>
  client.pipe(
    HttpClient.mapRequestEffect((request) =>
      Effect.map(Effect.serviceOption(RegistryRequestAttempt), (attempt) =>
        Option.isNone(attempt)
          ? request
          : HttpClientRequest.setHeader(request, "x-request-id", attempt.value.requestId),
      ),
    ),
    HttpClient.tap((response) =>
      Effect.gen(function* () {
        const attempt = yield* Effect.serviceOption(RegistryRequestAttempt);
        if (Option.isNone(attempt)) return;
        const requestId = validatedResponseRequestId(response);
        yield* attempt.value.observeResponse({
          status: response.status,
          ...(requestId === undefined ? {} : { requestId }),
        });
      }),
    ),
    HttpClient.transformResponse(Effect.flatMap(boundResolutionBody)),
    HttpClient.transformResponse(
      Effect.flatMap((response) =>
        response.status < 200 || response.status >= 300
          ? retainResponseBody(response)
          : Effect.succeed(response),
      ),
    ),
  );

export const retainedRegistryResponseBody = (
  response: HttpClientResponse.HttpClientResponse,
  fallback: unknown,
): unknown =>
  Object.hasOwn(response, retainedResponseBodyKey)
    ? Reflect.get(response, retainedResponseBodyKey)
    : fallback;

export const recoverRegistryResponseBodyText = (text: string): unknown => recoverBodyText(text);

/** Keep HTTP evidence when a generated response schema rejects a valid JSON body. */
export const preserveRegistryResponse = <A, E, R>(
  decoded: Effect.Effect<A, E, R>,
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<A, E | HttpClientError.HttpClientError, R> =>
  decoded.pipe(
    Effect.mapError((cause) =>
      Schema.isSchemaError(cause)
        ? new HttpClientError.HttpClientError({
            reason: new HttpClientError.DecodeError({
              request: response.request,
              response,
              cause,
            }),
          })
        : cause,
    ),
  );
