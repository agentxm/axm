import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ProblemDetails as RegistryProblemDetailsSchema } from "./__generated__/registry-client.js";

const decodeRegistryProblemDetails = Schema.decodeUnknownSync(RegistryProblemDetailsSchema);

const retryAfterFromBody = (status: number, body: unknown): number | undefined => {
  if (status !== 429 && status !== 503) return undefined;

  try {
    return decodeRegistryProblemDetails(body).details?.retryAfterSeconds;
  } catch {
    return undefined;
  }
};

export const parseRetryAfterHeader = (
  value: string | undefined,
  nowMillis: number,
): number | undefined => {
  if (value === undefined) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const retryAt = DateTime.make(value);
  if (Option.isNone(retryAt)) return undefined;

  return Math.max(0, Math.ceil((DateTime.toEpochMillis(retryAt.value) - nowMillis) / 1_000));
};

export const registryRetryAfterSeconds = (args: {
  readonly status: number;
  readonly body: unknown;
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly nowMillis: number;
}): number | undefined =>
  parseRetryAfterHeader(
    args.response.headers["retry-after"] ?? args.response.headers["Retry-After"],
    args.nowMillis,
  ) ?? retryAfterFromBody(args.status, args.body);
