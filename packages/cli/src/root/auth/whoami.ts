import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, resolveRequiredToken } from "@agentxm/client-core/unstable/auth";
import { errAuthRequired } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withAuthRuntime } from "../../runtime.js";

export const WhoamiDataSchema = Schema.Struct({
  user: Schema.String,
  registry: Schema.String,
});
const WhoamiDocumentFields = {
  data: WhoamiDataSchema,
} satisfies Schema.Struct.Fields;
export const WhoamiDocumentSchema = Schema.Struct(WhoamiDocumentFields);
export type WhoamiDocument = typeof WhoamiDocumentSchema.Type;

export const handleWhoami = Effect.fn("AuthWhoami.handle")(function* () {
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("Not authenticated"),
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
}, Effect.asVoid);

const whoamiConfig = {} as const;

export const whoamiCommand = Command.make("whoami", whoamiConfig, () =>
  handleWhoami().pipe(withAuthRuntime("auth whoami")),
).pipe(
  withArgvTracking(whoamiConfig),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm auth whoami", description: "Check who you're authenticated as" },
    { command: "axm whoami", description: "Same command via shortcut" },
    { command: "axm auth whoami --json", description: "Get identity as JSON for scripts" },
  ]),
);
