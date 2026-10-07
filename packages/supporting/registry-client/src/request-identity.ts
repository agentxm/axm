import type * as HttpClientResponse from "effect/http/HttpClientResponse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Read correlation before decoding a body that may itself be malformed. */
export const validatedResponseRequestId = (
  response: HttpClientResponse.HttpClientResponse,
): string | undefined => {
  const value = response.headers["x-request-id"];
  return value !== undefined && UUID.test(value) ? value : undefined;
};
