import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { AuthClient, RegistryUrl, resolveRequiredToken } from "@agentxm/client-core/unstable/auth";
import { errAuthRequired } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type DetailView } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withAuthRuntime } from "../../runtime.js";

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
const WhoamiDocumentFields = {
  data: WhoamiDataSchema,
} satisfies Schema.Struct.Fields;

interface WhoamiDetailItem {
  readonly handle: string;
  readonly email: string;
  readonly tokenType: string;
  readonly scopes: string;
  readonly organizations: string;
}

const WhoamiDetail = {
  fields: {
    handle: { label: "Handle" },
    email: { label: "Email" },
    tokenType: { label: "Token type" },
    scopes: { label: "Scopes" },
    organizations: { label: "Organizations" },
  },
} as const satisfies DetailView<WhoamiDetailItem>;

export const handleWhoami = Effect.fn("AuthWhoami.handle")(function* () {
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: errAuthRequired("Not authenticated"),
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
  if (yield* renderer.result({ data: identity }, Schema.Struct(WhoamiDocumentFields))) {
    return;
  }

  const detail: WhoamiDetailItem = {
    handle: me.userHandle,
    email: me.email,
    tokenType: me.tokenType,
    scopes: me.scopes.join(", "),
    organizations: me.orgs.map((org) => org.handle).join(", "),
  };

  yield* renderer.detail(detail, WhoamiDetail, "Authenticated identity");
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
