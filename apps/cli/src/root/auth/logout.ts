import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { logout, selectedRegistry } from "@agentxm/registry-auth";
import { coerceAuthFailure } from "../../feature-errors.js";
import { Screen, successDoc } from "../../screen/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
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
    const screen = yield* Screen;
    const registry = yield* selectedRegistry;

    const outcome = yield* withLiveOperation(
      { command: "auth.logout", name: `Sign out of ${registry.host}`, mode: "apply" },
      logout(registry.url),
    );

    const status: LogoutStatus =
      outcome._tag === "NotSignedIn"
        ? "not-logged-in"
        : outcome.revokedRemotely
          ? "logged-out"
          : "logged-out-local-only";
    const result: LogoutResult = {
      status,
      registryHost: outcome.registryHost,
      ...(outcome._tag === "SignedOut" && outcome.handle !== undefined
        ? { handle: outcome.handle }
        : {}),
    };
    const suggestions = logoutSuggestions(status);
    if (yield* screen.document({ result }, LogoutDocumentSchema, { suggestions })) return;

    const identity = result.handle === undefined ? "" : ` as ${result.handle}`;
    yield* screen.result(
      successDoc(
        status === "not-logged-in"
          ? `Not logged in to ${result.registryHost}.`
          : status === "logged-out"
            ? `Logged out of ${result.registryHost}${identity}.`
            : `Logged out of ${result.registryHost}${identity} locally. Remote revocation failed — token will expire automatically.`,
        { suggestions },
      ),
    );
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
