/**
 * Logout command handler -- Effect-based token revocation and credential clearing.
 *
 * Flow:
 * 1. Load credentials from store
 * 2. If no credentials: display "Not logged in." and return
 * 3. Revoke token via AuthClient (tolerate failure)
 * 4. Clear local credentials
 * 5. Display result
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthClient } from "../../../auth/auth-client.js";
import { CredentialStore } from "../../../auth/credential-store.js";
import { ClackLog } from "../../../clack-effect/log/service.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogout = Effect.fn("AuthLogout.handle")(function* () {
  const authClient = yield* AuthClient;
  const credStore = yield* CredentialStore;
  const log = yield* ClackLog;

  const registryUrl = DEFAULT_REGISTRY_URL;

  // Step 1: Load credentials
  const existing = yield* credStore.load(registryUrl);

  if (Option.isNone(existing)) {
    yield* log.info("Not logged in.");
    return;
  }

  // Step 2: Attempt remote revoke (tolerate failure)
  const revokeResult = yield* authClient
    .revokeToken(registryUrl, existing.value.access_token)
    .pipe(Effect.option);

  // Step 3: Clear local credentials
  yield* credStore.clear(registryUrl);

  // Step 4: Display result
  if (Option.isSome(revokeResult)) {
    yield* log.success("Logged out successfully.");
  } else {
    yield* log.warn("Signed out locally, but remote revoke failed.");
    yield* log.info("Your token may still be active on the server. It will expire automatically.");
  }
}, Effect.asVoid);
