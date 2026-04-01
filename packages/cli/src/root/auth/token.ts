/**
 * Token command handler -- outputs current resolved token to stdout.
 *
 * Flow:
 * 1. Resolve token via shared auth resolution (no interactive fallback)
 * 2. If no token: fail with the environment-appropriate auth error
 * 3. Output raw token to stdout, or JSON when explicitly requested
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { RegistryUrl, resolveRequiredToken } from "@axm.sh/core/unstable/auth";
import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withAuthRuntime } from "../../runtime.js";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

const TokenResultSchema = Schema.Struct({
  token: Schema.String,
});

export const handleToken = Effect.fn("AuthToken.handle")(function* () {
  const registryUrl = yield* RegistryUrl;
  const renderer = yield* CliRenderer;
  const json = Option.getOrElse(yield* jsonFlag, () => false);

  // Step 1: Resolve token
  const token = yield* resolveRequiredToken(registryUrl);

  // Step 2: Output raw token to stdout, unless --json was explicitly requested
  if (json) {
    yield* renderer.result({ token: token.token }, TokenResultSchema);
    return;
  }

  yield* renderer.raw(token.token + "\n");
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const tokenConfig = {} as const;

export const tokenCommand = Command.make("token", tokenConfig, () =>
  handleToken().pipe(withAuthRuntime({ command: "auth token" })),
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
    { command: "", description: "See also: auth login, auth whoami" },
  ]),
);
