/**
 * Token command handler -- outputs current resolved token to stdout.
 *
 * Flow:
 * 1. Resolve token via resolveToken (no interactive fallback)
 * 2. If no token: fail with AUTH_LOGIN_REQUIRED
 * 3. Output raw token to stdout with trailing newline
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { resolveToken } from "../../../auth/token-resolution.js";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleToken = Effect.fn("AuthToken.handle")(function* () {
  const registryUrl = yield* RegistryUrl;

  // Step 1: Resolve token
  const maybeToken = yield* resolveToken(registryUrl);

  if (Option.isNone(maybeToken)) {
    return yield* makeAppError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "No token available",
      howToFix: "Run `axm login` to sign in, or set the AXM_TOKEN environment variable.",
    });
  }

  // Step 2: Output raw token to stdout
  yield* Effect.sync(() => process.stdout.write(maybeToken.value.token + "\n"));
}, Effect.asVoid);
