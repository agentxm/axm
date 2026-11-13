import * as Effect from "effect/Effect";

/** Fixed protocol purposes only: never identifiers, credentials, URLs, or request payloads. */
type AuthRequestPurpose =
  | "pkce-exchange"
  | "device-authorization"
  | "device-token"
  | "identity"
  | "token-create"
  | "token-list"
  | "token-delete"
  | "session-refresh"
  | "workload-exchange"
  | "token-revoke"
  | "id-token";

export const observeAuthRequest = (purpose: AuthRequestPurpose) =>
  Effect.withSpan(
    "axm.auth.request",
    {
      attributes: { "axm.auth.purpose": purpose, "axm.work.requested": 1, "axm.work.executed": 1 },
    },
    { captureStackTrace: false },
  );
