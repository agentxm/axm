import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { RegistryUrl, resolveRequiredToken } from "@axm.sh/core/unstable/auth";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withAuthRuntime } from "../../runtime.js";

const TokenDataSchema = Schema.Struct({
  token: Schema.String,
});
const TokenDocumentFields = {
  data: TokenDataSchema,
} satisfies Schema.Struct.Fields;

export const handleToken = Effect.fn("AuthToken.handle")(function* () {
  const registryUrl = yield* RegistryUrl;
  const renderer = yield* CliRenderer;
  const json = Option.getOrElse(yield* jsonFlag, () => false);

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: makeAppError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "No token available",
      howToFix: "Run `axm login` to sign in, or set the AXM_TOKEN environment variable.",
    }),
  });

  // Step 2: Output raw token to stdout, unless --json was explicitly requested
  if (json) {
    yield* renderer.document("auth.token", { data: { token: token.token } }, TokenDocumentFields);
    return;
  }

  yield* renderer.raw(token.token + "\n");
}, Effect.asVoid);

const tokenConfig = {} as const;

export const tokenCommand = Command.make("token", tokenConfig, () =>
  handleToken().pipe(withAuthRuntime("auth token")),
).pipe(
  withArgvTracking(tokenConfig),
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    {
      command: "axm auth token",
      description: "Print your auth token (e.g., for piping to another tool)",
    },
    { command: "axm token", description: "Same command via shortcut" },
    { command: "axm auth token --json", description: "Get the token as structured JSON" },
  ]),
);
