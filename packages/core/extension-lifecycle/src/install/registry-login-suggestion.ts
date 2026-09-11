/**
 * The offline login hint an install refusal carries.
 *
 * When a registry lookup finds nothing, the extension may simply be private
 * to an account this invocation is not signed in to. Whether every consulted
 * origin already has a credential is the `registry-auth` capability's
 * decision; the wording of the hint is this feature's.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CredentialStore, hasCredentialsForAll } from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

const LOGIN_SUGGESTION: SuggestedAction = {
  description: "Sign in to check whether the extension is private.",
  cmd: "axm login",
};

/**
 * Suggest signing in when any consulted registry origin has no credential.
 *
 * The credential store and the default registry are optional: an invocation
 * composed without them (a workspace with no registry configured) offers no
 * hint rather than failing.
 */
export const registryLoginSuggestions = (
  locations: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<SuggestedAction>> =>
  Effect.gen(function* () {
    const store = yield* Effect.serviceOption(CredentialStore);
    const defaultRegistry = yield* Effect.serviceOption(RegistryUrl);
    if (Option.isNone(store) || Option.isNone(defaultRegistry)) return [];
    const present = yield* hasCredentialsForAll(locations, defaultRegistry.value).pipe(
      Effect.provideService(CredentialStore, store.value),
    );
    return present ? [] : [LOGIN_SUGGESTION];
  });
