import { registryFlag } from "../../cli-flags/index.js";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import { logout, selectedRegistry } from "@agentxm/registry-access/authentication";
import { coerceAuthFailure } from "../../feature-errors.js";
import { emitResult, successDoc, suggestionsDoc } from "../../screen/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { withArgvTracking } from "../../cli-runtime/index.js";
import * as Schema from "effect/Schema";
import { withRuntime } from "../../runtime.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

const LogoutResultSchema = Schema.Struct({
  status: Schema.Literals(["not-logged-in", "logged-out", "logged-out-local-only"] as const),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});
const LogoutDocumentFields = {
  result: LogoutResultSchema,
} satisfies Schema.Struct.Fields;
export const LogoutDocumentSchema = Schema.Struct(LogoutDocumentFields);

type LogoutResult = typeof LogoutResultSchema.Type;
type LogoutStatus = LogoutResult["status"];

const logoutSuggestions = (status: LogoutStatus): ReadonlyArray<SuggestedAction> =>
  status === "not-logged-in"
    ? [{ description: "Sign in to this registry", cmd: "axm login" }]
    : [{ description: "Sign in again", cmd: "axm login" }];

export const handleLogout = Effect.fn("AuthLogout.handle")(
  function* () {
    const registry = yield* selectedRegistry("Signing out");

    const outcome = yield* withLiveOperation(
      { name: `Sign out of ${registry.host}`, mode: "apply" },
      logout(registry),
      (outcome) => ({
        mode: "apply",
        outcome: outcome._tag === "NotSignedIn" ? "no-op" : "applied",
        exitCode: 0,
      }),
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
    yield* emitResult(
      { result },
      LogoutDocumentSchema,
      () => {
        const identity = result.handle === undefined ? "" : ` as ${result.handle}`;
        if (status === "logged-out-local-only")
          return [
            {
              _tag: "headline",
              tone: "ok",
              text: `Signed out of ${result.registryHost}${identity}`,
            },
            {
              _tag: "callout",
              tone: "warn",
              title: "The registry did not revoke the token",
              children: [
                {
                  _tag: "paragraph",
                  text: "AXM removed it from this machine; the registry still accepts it until it expires.",
                },
              ],
            },
            ...suggestionsDoc(suggestions),
          ];
        return successDoc(
          status === "not-logged-in"
            ? `Not signed in to ${result.registryHost}`
            : `Signed out of ${result.registryHost}${identity}`,
          { suggestions },
        );
      },
      {
        suggestions,
        completion: {
          mode: "apply",
          outcome: outcome._tag === "NotSignedIn" ? "no-op" : "applied",
          exitCode: 0,
        },
      },
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const logoutConfig = { registry: registryFlag } as const;

export const logoutCommand = Command.make("logout", logoutConfig, ({ registry }) =>
  handleLogout().pipe(withRuntime({ registry })),
).pipe(
  withArgvTracking(logoutConfig),
  withCommandCapabilities(directWriteCapabilities("credentials")),
  Command.withDescription("Sign out of a registry"),
  Command.withExamples([
    { command: "axm logout", description: "Sign out of the current registry" },
    { command: "axm logout --json", description: "Report the sign-out result as JSON" },
  ]),
);
