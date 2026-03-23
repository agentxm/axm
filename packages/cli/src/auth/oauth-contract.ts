import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { CliError } from "../cli-error/cli-error.js";
import { makeCliError } from "../cli-error/cli-error.js";

const TokenWireResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: Schema.optional(Schema.String),
  expires_in: Schema.optional(Schema.Number),
});

export interface NormalizedTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
}

export const setOAuthFormBody = (
  request: HttpClientRequest.HttpClientRequest,
  body: Record<string, string>,
) => HttpClientRequest.bodyUrlParams(request, body);

export const decodeTokenResponse = (
  parsed: unknown,
  code: string,
  what: string,
): Effect.Effect<NormalizedTokenResponse, CliError> =>
  Schema.decodeUnknownEffect(TokenWireResponseSchema)(parsed).pipe(
    Effect.mapError((error) =>
      makeCliError({
        code,
        what: `Invalid response schema: ${what}`,
        cause: error,
      }),
    ),
    Effect.flatMap((token) => {
      if (token.expires_at) {
        return Effect.succeed({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: token.expires_at,
        } satisfies NormalizedTokenResponse);
      }

      if (typeof token.expires_in === "number") {
        return Effect.succeed({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        } satisfies NormalizedTokenResponse);
      }

      return Effect.fail(
        makeCliError({
          code,
          what: `Invalid response schema: ${what}`,
          details: ["Expected token response to include expires_at or expires_in."],
        }),
      );
    }),
  );
