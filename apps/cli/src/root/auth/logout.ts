import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command } from "effect/unstable/cli";

import { AuthClient, CredentialStore } from "@agentxm/registry-auth";
import { coerceAuthFailure } from "../../feature-errors.js";
import { RegistryUrl } from "@agentxm/registry-client";
import { Screen, successDoc } from "../../screen/index.js";
import { observeUnit } from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { withArgvTracking } from "../../cli-runtime/index.js";
import * as Schema from "effect/Schema";
import { withRuntime } from "../../runtime.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export const LogoutResultSchema = Schema.Struct({
  status: Schema.Literals(["not-logged-in", "logged-out", "logged-out-local-only"] as const),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});
const LogoutDocumentFields = {
  result: LogoutResultSchema,
} satisfies Schema.Struct.Fields;
export const LogoutDocumentSchema = Schema.Struct(LogoutDocumentFields);

export type LogoutResult = typeof LogoutResultSchema.Type;
export type LogoutDocument = typeof LogoutDocumentSchema.Type;
type LogoutStatus = LogoutResult["status"];

const logoutSuggestions = (status: LogoutStatus): ReadonlyArray<SuggestedAction> =>
  status === "not-logged-in"
    ? [{ description: "Log in to this registry", cmd: "axm login" }]
    : [{ description: "Log in again", cmd: "axm login" }];

export const handleLogout = Effect.fn("AuthLogout.handle")(
  function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const screen = yield* Screen;
    const registryUrl = yield* RegistryUrl;
    const registryHost = new URL(registryUrl).host;

    // Step 1: Load credentials
    const existing = yield* credStore.load(registryUrl);

    if (Option.isNone(existing)) {
      const status: LogoutStatus = "not-logged-in";
      const suggestions = logoutSuggestions(status);
      const result = {
        status,
        registryHost,
      };
      if (yield* screen.document({ result }, LogoutDocumentSchema, { suggestions })) {
        return;
      }
      yield* screen.result(successDoc(`Not logged in to ${registryHost}.`, { suggestions }));
      return;
    }

    const handle = existing.value.handle;
    // The anonymous sentinel is normalizeHandle("@unknown") — including the "@".
    const identity = handle === "@unknown" ? "" : ` as ${handle}`;
    const optionalHandle = handle !== "@unknown" ? { handle } : {};

    // Step 2: Attempt remote revoke (tolerate failure)
    const revokeResult = yield* withLiveOperation(
      { command: "auth.logout", name: `Sign out of ${registryHost}`, mode: "apply" },
      observeUnit(
        { id: "revoke", label: `registry session on ${registryHost}` },
        authClient.revokeToken(existing.value.refresh_token).pipe(Effect.option),
      ),
    );

    // Step 3: Clear local credentials
    yield* credStore.clear(registryUrl);

    // Step 4: Build result and render
    const status: LogoutStatus = Option.isSome(revokeResult)
      ? "logged-out"
      : "logged-out-local-only";
    const result = {
      status,
      registryHost,
      ...optionalHandle,
    };
    const suggestions = logoutSuggestions(status);

    if (yield* screen.document({ result }, LogoutDocumentSchema, { suggestions })) {
      return;
    }

    if (Option.isSome(revokeResult)) {
      yield* screen.result(
        successDoc(`Logged out of ${registryHost}${identity}.`, { suggestions }),
      );
    } else {
      yield* screen.result(
        successDoc(
          `Logged out of ${registryHost}${identity} locally. Remote revocation failed — token will expire automatically.`,
          { suggestions },
        ),
      );
    }
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const logoutConfig = {} as const;

export const logoutCommand = Command.make("logout", logoutConfig, () =>
  handleLogout().pipe(withRuntime("auth logout")),
).pipe(
  withArgvTracking(logoutConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Sign out of a registry"),
  Command.withExamples([
    { command: "axm logout", description: "Sign out of the current registry" },
    { command: "axm logout --json", description: "Report the sign-out result as JSON" },
  ]),
);
