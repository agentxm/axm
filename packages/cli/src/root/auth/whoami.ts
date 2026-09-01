import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { AuthClient, authLoginRequired, resolveRequiredToken } from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";

export const WhoamiDataSchema = Schema.Struct({
  user: Schema.String,
  registry: Schema.String,
});
const WhoamiDocumentFields = {
  data: WhoamiDataSchema,
} satisfies Schema.Struct.Fields;
export const WhoamiDocumentSchema = Schema.Struct(WhoamiDocumentFields);
export type WhoamiDocument = typeof WhoamiDocumentSchema.Type;

export const handleWhoami = Effect.fn("AuthWhoami.handle")(
  function* () {
    const authClient = yield* AuthClient;
    const renderer = yield* CliRenderer;
    const registryUrl = yield* RegistryUrl;

    // Step 1: Resolve token
    const token = yield* resolveRequiredToken(registryUrl, {
      missingTokenError: authLoginRequired("Not authenticated"),
    });

    // Step 2: Call whoami
    const registryHost = new URL(registryUrl).host;
    const identity = yield* renderer.withSpinner(
      `Checking identity on ${registryHost}`,
      () => authClient.getWhoami(token.token),
      { successMessage: `Checked identity on ${registryHost}` },
    );
    const result = {
      user: identity.handle,
      registry: registryUrl,
    };

    // Step 3: Display result
    if (yield* renderer.result({ data: result }, WhoamiDocumentSchema)) {
      return;
    }

    yield* renderer.raw(`Authenticated as ${result.user}\nRegistry  ${result.registry}\n`);
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
