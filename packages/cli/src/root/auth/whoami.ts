import * as DateTime from "effect/DateTime";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import {
  AuthClient,
  authLoginRequired,
  resolveRequiredToken,
  refreshStoredToken,
} from "@agentxm/registry-auth";
import { RegistryUrl, isRegistryClientFailure } from "@agentxm/registry-client";
import { Screen, rawDoc } from "../../screen/index.js";
import { observeUnit } from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";

export const WhoamiDataSchema = Schema.Struct({
  user: Schema.String,
  registry: Schema.String,
  credentialType: Schema.String,
  scopes: Schema.Array(Schema.String),
  resourceRestrictions: Schema.Struct({ extensions: Schema.NullOr(Schema.Array(Schema.String)) }),
  expiresAt: Schema.NullOr(DateTimeUtcSchema),
});
const WhoamiDocumentFields = {
  data: WhoamiDataSchema,
} satisfies Schema.Struct.Fields;
export const WhoamiDocumentSchema = Schema.Struct(WhoamiDocumentFields);
export type WhoamiDocument = typeof WhoamiDocumentSchema.Type;

export const handleWhoami = Effect.fn("AuthWhoami.handle")(
  function* () {
    const authClient = yield* AuthClient;
    const screen = yield* Screen;
    const registryUrl = yield* RegistryUrl;

    // Step 1: Resolve token
    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: authLoginRequired("Not authenticated"),
    });

    // Step 2: Read the canonical Registry identity
    const registryHost = new URL(registryUrl).host;
    const identity = yield* withLiveOperation(
      { command: "auth.whoami", name: `Check identity on ${registryHost}`, mode: "preview" },
      observeUnit(
        { id: "identity", label: `identity on ${registryHost}` },
        authClient.getMe(token.token).pipe(
          Effect.catch((error) => {
            if (
              token._tag !== "CredentialStore" ||
              !isRegistryClientFailure(error) ||
              error.metadata?.response?.status !== 401
            ) {
              return Effect.fail(error);
            }
            return refreshStoredToken(token).pipe(
              Effect.flatMap((refreshed) => authClient.getMe(refreshed.token)),
            );
          }),
          Effect.mapError((error) =>
            isRegistryClientFailure(error) && error.metadata?.response?.status === 401
              ? authLoginRequired("Invalid or expired credential. Authenticate again.", error)
              : error,
          ),
        ),
      ),
    );
    const result = {
      user: identity.userHandle,
      registry: registryUrl,
      credentialType: identity.tokenType,
      scopes: identity.scopes,
      resourceRestrictions: identity.resourceRestrictions,
      expiresAt: identity.expiresAt,
    };

    // Step 3: Display result
    if (yield* screen.document({ data: result }, WhoamiDocumentSchema)) {
      return;
    }

    const restrictions = result.resourceRestrictions.extensions;
    yield* screen.result(
      rawDoc(
        [
          `Authenticated as ${result.user}`,
          `Registry  ${result.registry}`,
          `Credential  ${result.credentialType}`,
          `Scopes  ${result.scopes.length === 0 ? "none" : result.scopes.join(", ")}`,
          `Extensions  ${restrictions === null ? "unrestricted" : restrictions.length === 0 ? "none" : restrictions.join(", ")}`,
          `Expires  ${result.expiresAt === null ? "unavailable" : DateTime.formatIso(result.expiresAt)}`,
          "",
        ].join("\n"),
      ),
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const whoamiConfig = {} as const;

export const whoamiCommand = Command.make("whoami", whoamiConfig, () =>
  handleWhoami().pipe(withRuntime("auth whoami")),
).pipe(
  withArgvTracking(whoamiConfig),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm whoami", description: "Check who you're authenticated as" },
    { command: "axm whoami --json", description: "Get identity as JSON for scripts" },
  ]),
);
