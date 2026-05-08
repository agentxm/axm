import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, CredentialStore } from "@agentxm/client-core/unstable/auth";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import * as Schema from "effect/Schema";
import { withAuthRuntime } from "../../runtime.js";

const LogoutResultSchema = Schema.Struct({
  status: Schema.Literals(["not-logged-in", "logged-out", "logged-out-local-only"] as const),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});
const LogoutDocumentFields = {
  result: LogoutResultSchema,
} satisfies Schema.Struct.Fields;

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
      yield* renderer.result(
        { result: { status: "not-logged-in", registryHost } },
        Schema.Struct(LogoutDocumentFields),
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

  if (yield* renderer.result({ result }, Schema.Struct(LogoutDocumentFields))) {
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

const logoutConfig = {} as const;

export const logoutCommand = Command.make("logout", logoutConfig, () =>
  handleLogout().pipe(withAuthRuntime("auth logout")),
).pipe(
  withArgvTracking(logoutConfig),
  Command.withDescription("Sign out of a registry"),
  Command.withExamples([
    { command: "axm auth logout", description: "Sign out of the current registry" },
    { command: "axm logout", description: "Same command via shortcut" },
  ]),
);
