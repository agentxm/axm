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
import * as Schema from "effect/Schema";

import { AuthClient, RegistryUrl, resolveToken } from "@axm.sh/core/unstable/auth";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface WhoamiHandlerArgs {
  readonly json: boolean;
}

const WhoamiResultSchema = Schema.Struct({
  userId: Schema.String,
  userHandle: Schema.String,
  email: Schema.String,
  tokenType: Schema.String,
  scopes: Schema.Array(Schema.String),
  orgs: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      handle: Schema.String,
    }),
  ),
});

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleWhoami = Effect.fn("AuthWhoami.handle")(function* (args: WhoamiHandlerArgs) {
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
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
  const identity = {
    userId: me.userId,
    userHandle: me.userHandle,
    email: me.email,
    tokenType: me.tokenType,
    scopes: me.scopes,
    orgs: me.orgs,
  };

  // Step 3: Display result
  if (args.json) {
    yield* renderer.json(identity);
    return;
  }

  if (yield* renderer.result(identity, WhoamiResultSchema)) {
    return;
  }

  yield* renderer.info(`Handle:     ${me.userHandle}`);
  yield* renderer.info(`Email:      ${me.email}`);
  yield* renderer.info(`Token type: ${me.tokenType}`);
}, Effect.asVoid);
