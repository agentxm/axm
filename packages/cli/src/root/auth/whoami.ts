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
import { Command, Flag } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, resolveToken } from "@axm.sh/core/unstable/auth";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

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
  const me = yield* authClient.getMe(maybeToken.value.token);
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

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const whoamiConfig = {
  json: Flag.boolean("json").pipe(
    Flag.withDescription("Output identity details as JSON (useful for scripting)"),
  ),
} as const;

export const whoamiCommand = Command.make("whoami", whoamiConfig, ({ json }) =>
  withRuntime(handleWhoami({ json }), { command: "auth whoami" }),
).pipe(
  withArgvTracking(whoamiConfig),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm auth whoami", description: "Check who you're authenticated as" },
    { command: "axm whoami", description: "Same command via shortcut" },
    { command: "axm auth whoami --json", description: "Get identity as JSON for scripts" },
    { command: "", description: "See also: auth login, auth token" },
  ]),
);
