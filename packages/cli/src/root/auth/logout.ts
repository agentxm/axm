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
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, CredentialStore } from "@axm.sh/core/unstable/auth";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogout = Effect.fn("AuthLogout.handle")(function* () {
  const authClient = yield* AuthClient;
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  // Step 1: Load credentials
  const existing = yield* credStore.load(registryUrl);

  if (Option.isNone(existing)) {
    yield* renderer.success(`Not logged in to ${registryUrl}. Nothing to do.`);
    return;
  }

  const handle = existing.value.handle;

  // Step 2: Attempt remote revoke (tolerate failure)
  const revokeResult = yield* authClient
    .revokeToken(registryUrl, existing.value.access_token)
    .pipe(Effect.option);

  // Step 3: Clear local credentials
  yield* credStore.clear(registryUrl);

  // Step 4: Display result
  if (Option.isSome(revokeResult)) {
    yield* renderer.success(`Logged out of ${registryUrl} as ${handle}.`);
  } else {
    yield* renderer.warn(
      `Logged out of ${registryUrl} as ${handle} locally. Remote revocation failed — token will expire automatically.`,
    );
  }
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const logoutConfig = {} as const;

export const logoutCommand = Command.make("logout", logoutConfig, () =>
  withRuntime(handleLogout(), { command: "auth logout" }),
).pipe(withArgvTracking(logoutConfig), Command.withDescription("Sign out of a registry"));
