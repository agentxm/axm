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
import * as Schema from "effect/Schema";

import { authCommandMeta, annotateCommandMeta, withCommandRuntime } from "../../command-meta.js";
import { emitResultDocument } from "../../json-output.js";

const LogoutResultSchema = Schema.Struct({
  status: Schema.Literals(["not-logged-in", "logged-out", "logged-out-local-only"] as const),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogout = Effect.fn("AuthLogout.handle")(function* () {
  const authClient = yield* AuthClient;
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;
  const registryHost = new URL(registryUrl).host;

  // Step 1: Load credentials
  const existing = yield* credStore.load(registryUrl);

  if (Option.isNone(existing)) {
    if (
      yield* emitResultDocument(
        "auth.logout",
        { status: "not-logged-in", registryHost },
        LogoutResultSchema,
      )
    ) {
      return;
    }
    yield* renderer.success(`Not logged in to ${registryHost}. Nothing to do.`);
    return;
  }

  const handle = existing.value.handle;
  const identity = handle === "unknown" ? "" : ` as ${handle}`;
  const optionalHandle = handle !== "unknown" ? { handle } : {};

  // Step 2: Attempt remote revoke (tolerate failure)
  const revokeResult = yield* authClient
    .revokeToken(existing.value.access_token)
    .pipe(Effect.option);

  // Step 3: Clear local credentials
  yield* credStore.clear(registryUrl);

  // Step 4: Build result and render
  const status = Option.isSome(revokeResult) ? "logged-out" : "logged-out-local-only";
  const result = { status, registryHost, ...optionalHandle } as const;

  if (yield* emitResultDocument("auth.logout", result, LogoutResultSchema)) {
    return;
  }

  if (Option.isSome(revokeResult)) {
    yield* renderer.success(`Logged out of ${registryHost}${identity}.`);
  } else {
    yield* renderer.warn(
      `Logged out of ${registryHost}${identity} locally. Remote revocation failed — token will expire automatically.`,
    );
  }
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const logoutConfig = {} as const;
const commandMeta = authCommandMeta("auth logout", { json: true });

export const logoutCommand = Command.make("logout", logoutConfig, () =>
  handleLogout().pipe(withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(logoutConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Sign out of a registry"),
  Command.withExamples([
    { command: "axm auth logout", description: "Sign out of the current registry" },
    { command: "axm logout", description: "Same command via shortcut" },
    { command: "", description: "See also: auth login" },
  ]),
);
