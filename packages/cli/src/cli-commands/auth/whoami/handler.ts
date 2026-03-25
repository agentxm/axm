/**
 * Whoami command handler -- identity resolution via /v1/auth/me.
 *
 * Flow:
 * 1. Resolve token via resolveToken
 * 2. If no token: fail with AUTH_LOGIN_REQUIRED
 * 3. Call AuthClient.getMe
 * 4. Display identity (or JSON with --json flag)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthClient } from "../../../auth/auth-client.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { resolveToken } from "../../../auth/token-resolution.js";
import { Output } from "@axm.sh/core/unstable/output";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface WhoamiHandlerArgs {
  readonly json: boolean;
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleWhoami = Effect.fn("AuthWhoami.handle")(function* (args: WhoamiHandlerArgs) {
  const authClient = yield* AuthClient;
  const output = yield* Output;
  const registryUrl = yield* RegistryUrl;

  // Step 1: Resolve token
  const maybeToken = yield* resolveToken(registryUrl);

  if (Option.isNone(maybeToken)) {
    return yield* makeAppError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "Not authenticated",
      howToFix: "Run `axm login` to sign in.",
    });
  }

  // Step 2: Call getMe
  const me = yield* authClient.getMe(registryUrl, maybeToken.value.token);

  // Step 3: Display result
  if (args.json) {
    yield* Effect.sync(() =>
      process.stdout.write(
        JSON.stringify(
          {
            userId: me.userId,
            userHandle: me.userHandle,
            email: me.email,
            tokenType: me.tokenType,
            scopes: me.scopes,
            orgs: me.orgs,
          },
          null,
          2,
        ) + "\n",
      ),
    );
  } else {
    yield* output.info(`Handle:     ${me.userHandle}`);
    yield* output.info(`Email:      ${me.email}`);
    yield* output.info(`Token type: ${me.tokenType}`);
  }
}, Effect.asVoid);
