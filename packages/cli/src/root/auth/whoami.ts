/**
 * Whoami command handler -- identity resolution via /v1/auth/me.
 *
 * Flow:
 * 1. Resolve token via shared auth resolution
 * 2. If no token: fail with the environment-appropriate auth error
 * 3. Call AuthClient.getMe
 * 4. Display identity
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, resolveRequiredToken } from "@axm.sh/core/unstable/auth";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { authCommandMeta, annotateCommandMeta, withCommandRuntime } from "../../command-meta.js";
import { emitDataResult } from "../../json-output.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

const WhoamiDataSchema = Schema.Struct({
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

export const handleWhoami = Effect.fn("AuthWhoami.handle")(function* () {
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: makeAppError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "Not authenticated",
      howToFix: "Run `axm login` to sign in.",
    }),
  });

  // Step 2: Call getMe
  const me = yield* authClient.getMe(token.token);
  const identity = {
    userId: me.userId,
    userHandle: me.userHandle,
    email: me.email,
    tokenType: me.tokenType,
    scopes: me.scopes,
    orgs: me.orgs,
  };

  // Step 3: Display result
  if (yield* emitDataResult("auth.whoami", identity, WhoamiDataSchema)) {
    return;
  }

  yield* renderer.info(`Handle:     ${me.userHandle}`);
  yield* renderer.info(`Email:      ${me.email}`);
  yield* renderer.info(`Token type: ${me.tokenType}`);
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const whoamiConfig = {} as const;
const commandMeta = authCommandMeta("auth whoami", { json: true });

export const whoamiCommand = Command.make("whoami", whoamiConfig, () =>
  handleWhoami().pipe(withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(whoamiConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm auth whoami", description: "Check who you're authenticated as" },
    { command: "axm whoami", description: "Same command via shortcut" },
    { command: "axm auth whoami --json", description: "Get identity as JSON for scripts" },
    { command: "", description: "See also: auth login, auth token" },
  ]),
);
