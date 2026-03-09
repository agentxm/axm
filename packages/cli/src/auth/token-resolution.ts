/**
 * Token resolution with precedence chain.
 *
 * Resolves authentication tokens from multiple sources in priority order:
 * 1. AXM_TOKEN environment variable
 * 2. --token flag (per-command, passed as parameter)
 * 3. Credential store lookup by registry URL
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { CliError } from "../cli-error/cli-error.js";
import { CredentialStore } from "./credential-store.js";
import {
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FlagTokenSource,
  type TokenSource,
} from "./schema.js";

// -----------------------------------------------------------------------------
// AXM_TOKEN stderr message (once per CLI invocation)
// -----------------------------------------------------------------------------

declare global {
  var __axmEnvVarMessageEmitted: boolean | undefined;
}

const emitEnvVarMessage = Effect.gen(function* () {
  if (!globalThis.__axmEnvVarMessageEmitted) {
    globalThis.__axmEnvVarMessageEmitted = true;
    yield* Effect.logWarning("Authenticating via AXM_TOKEN environment variable");
  }
});

/**
 * Reset the env var message flag. For testing only.
 */
export const resetEnvVarMessageFlag = () => {
  globalThis.__axmEnvVarMessageEmitted = false;
};

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

/**
 * Resolve a token from the precedence chain.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. --token flag (passed as `flagToken` parameter)
 * 3. CredentialStore lookup by registry URL
 *
 * Returns `Option.none()` when no token is available from any source.
 */
export const resolveToken = (
  registryUrl: string,
  flagToken?: string,
): Effect.Effect<Option.Option<TokenSource>, CliError, CredentialStore> =>
  Effect.gen(function* () {
    // 1. AXM_TOKEN env var
    const envToken = process.env["AXM_TOKEN"];
    if (envToken !== undefined && envToken.length > 0) {
      yield* emitEnvVarMessage;
      return Option.some<TokenSource>(new EnvVarTokenSource({ token: envToken }));
    }

    // 2. --token flag
    if (flagToken !== undefined && flagToken.length > 0) {
      return Option.some<TokenSource>(new FlagTokenSource({ token: flagToken }));
    }

    // 3. Credential store
    const store = yield* CredentialStore;
    const stored = yield* store.load(registryUrl);
    return Option.map(
      stored,
      (creds): TokenSource =>
        new CredentialStoreTokenSource({
          token: creds.access_token,
          refresh_token: creds.refresh_token,
          expires_at: creds.expires_at,
          registryUrl,
        }),
    );
  });
