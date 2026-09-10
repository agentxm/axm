import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CredentialStore, hasCredentialsForAll } from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";

export interface RegistryLoginSuggestion {
  readonly description: string;
  readonly cmd: string;
}

const LOGIN_SUGGESTION: RegistryLoginSuggestion = {
  description: "Sign in to check whether the extension is private.",
  cmd: "axm login",
};

/**
 * The wording for the offline login hint, over the `registry-auth`
 * credential-presence decision.
 *
 * The service capture below exists only because the resolver is handed to
 * source-resolution call sites that require `R = never`; the decision itself
 * — which origins already have a credential — is the capability's.
 */
export const makeRegistryLoginSuggestionResolver = Effect.gen(function* () {
  const maybeStore = yield* Effect.serviceOption(CredentialStore);
  const maybeDefaultRegistry = yield* Effect.serviceOption(RegistryUrl);

  if (Option.isNone(maybeStore) || Option.isNone(maybeDefaultRegistry)) {
    return (_locations: ReadonlyArray<string>) =>
      Effect.succeed<ReadonlyArray<RegistryLoginSuggestion>>([]);
  }

  const credentials = Layer.succeed(CredentialStore, maybeStore.value);
  const defaultRegistryUrl = maybeDefaultRegistry.value;

  return (locations: ReadonlyArray<string>) =>
    hasCredentialsForAll(locations, defaultRegistryUrl).pipe(
      Effect.provide(credentials),
      Effect.map((present) => (present ? [] : [LOGIN_SUGGESTION])),
    );
});
