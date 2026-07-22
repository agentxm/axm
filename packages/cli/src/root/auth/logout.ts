import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, CredentialStore } from "@agentxm/client-core/unstable/auth";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  OperationPlanFields,
  makeSingleStepOperationPlan,
  type SuggestedAction,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import * as Schema from "effect/Schema";
import { withAuthRuntime } from "../../runtime.js";

const LogoutResultSchema = Schema.Struct({
  ...OperationPlanFields,
  status: Schema.Literals(["not-logged-in", "logged-out", "logged-out-local-only"] as const),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});
const LogoutDocumentFields = {
  result: LogoutResultSchema,
} satisfies Schema.Struct.Fields;

type LogoutResult = typeof LogoutResultSchema.Type;
type LogoutStatus = LogoutResult["status"];

const logoutSuggestions = (status: LogoutStatus): ReadonlyArray<SuggestedAction> =>
  status === "not-logged-in"
    ? [{ description: "Log in to this registry", cmd: "axm login" }]
    : [{ description: "Log in again", cmd: "axm login" }];

export const handleLogout = Effect.fn("AuthLogout.handle")(function* () {
  const authClient = yield* AuthClient;
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;
  const registryHost = new URL(registryUrl).host;

  // Step 1: Load credentials
  const existing = yield* credStore.load(registryUrl);

  if (Option.isNone(existing)) {
    const status: LogoutStatus = "not-logged-in";
    const suggestions = logoutSuggestions(status);
    const result = {
      ...makeSingleStepOperationPlan({
        planName: "Log out of AXM registry",
        planDescription: "Remove persisted registry credentials from this machine",
        message: `Not logged in to ${registryHost}`,
        stepLabel: "Registry credentials",
        stepStatus: "unchanged",
        stepMessage: "No persisted credentials found",
        artifact: {
          path: registryHost,
          scope: "user",
          change: "unchanged",
        },
      }),
      status,
      registryHost,
    };
    if (yield* renderer.result({ result }, Schema.Struct(LogoutDocumentFields), { suggestions })) {
      return;
    }
    yield* renderer.success(`Not logged in to ${registryHost}.`, { suggestions });
    return;
  }

  const handle = existing.value.handle;
  // The anonymous sentinel is normalizeHandle("@unknown") — including the "@".
  const identity = handle === "@unknown" ? "" : ` as ${handle}`;
  const optionalHandle = handle !== "@unknown" ? { handle } : {};

  // Step 2: Attempt remote revoke (tolerate failure)
  const revokeResult = yield* authClient
    .revokeToken(existing.value.refresh_token)
    .pipe(Effect.option);

  // Step 3: Clear local credentials
  yield* credStore.clear(registryUrl);

  // Step 4: Build result and render
  const status: LogoutStatus = Option.isSome(revokeResult) ? "logged-out" : "logged-out-local-only";
  const result = {
    ...makeSingleStepOperationPlan({
      planName: "Log out of AXM registry",
      planDescription: "Remove persisted registry credentials from this machine",
      message:
        status === "logged-out"
          ? `Logged out of ${registryHost}${identity}`
          : `Logged out of ${registryHost}${identity} locally`,
      stepLabel: "Registry credentials",
      stepStatus: "applied",
      stepMessage:
        status === "logged-out"
          ? "Revoked remote session and cleared local credentials"
          : "Cleared local credentials",
      warnings:
        status === "logged-out-local-only"
          ? ["Remote revocation failed; token will expire automatically."]
          : [],
      artifact: {
        path: registryHost,
        scope: "user",
        change: "removed",
      },
    }),
    status,
    registryHost,
    ...optionalHandle,
  };
  const suggestions = logoutSuggestions(status);

  if (yield* renderer.result({ result }, Schema.Struct(LogoutDocumentFields), { suggestions })) {
    return;
  }

  if (Option.isSome(revokeResult)) {
    yield* renderer.success(`Logged out of ${registryHost}${identity}.`, { suggestions });
  } else {
    yield* renderer.success(
      `Logged out of ${registryHost}${identity} locally. Remote revocation failed — token will expire automatically.`,
      { suggestions },
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
