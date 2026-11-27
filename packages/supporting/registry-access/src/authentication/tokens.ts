/**
 * Granular access-token operations a signed-in CLI may perform: listing and
 * revoking tokens. Creating one is browser-only; the Registry refuses every
 * Registry credential with `browser_session_required`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { AuthClient } from "./auth-client.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import type { SelectedRegistry } from "./selected-registry.js";
import { requireSignedIn } from "./identity.js";

/**
 * Revoking a token takes authority away, so a signed-in person simply does it:
 * nothing here asks them to prove themselves again.
 */
export const revokeToken = Effect.fn("Tokens.revoke")(function* (
  tokenId: string,
  registry: SelectedRegistry,
) {
  const authClient = yield* AuthClient;
  yield* requireSignedIn(registry);
  yield* authClient.deleteToken(registry.endpoint, tokenId);
  return { tokenId };
});

export const listTokens = Effect.fn("Tokens.list")(function* (
  registry: SelectedRegistry,
  page?: { readonly limit?: number; readonly cursor?: string },
) {
  const authClient = yield* AuthClient;
  const presenter = yield* AuthLoginPresenter;
  yield* requireSignedIn(registry);
  return yield* presenter.withProgress({ _tag: "ListingRegistryTokens" }, () =>
    authClient.listTokens(registry.endpoint, page),
  );
});
