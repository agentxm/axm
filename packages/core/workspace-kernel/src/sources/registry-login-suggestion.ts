/**
 * The offline access hint an install refusal carries.
 *
 * When a registry lookup finds nothing, the extension may simply be private
 * to an account this invocation is not signed in to, or to one other than
 * the account it is signed in with. Whether every consulted Registry already
 * has a credential is the `registry-access` capability's decision; the
 * wording of the hint is this module's.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CredentialStore, hasCredentialsForAll } from "@agentxm/registry-access/credentials";
import { RegistryContext } from "@agentxm/registry-client";
import type { RegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

const LOGIN_SUGGESTION: SuggestedAction = {
  description: "Sign in to check whether the extension is private.",
  cmd: "axm login",
};

const ACCOUNT_SUGGESTION: SuggestedAction = {
  description: "See which account is signed in; a private extension needs one that can read it.",
  cmd: "axm whoami",
};

/**
 * Suggest signing in when any consulted HTTP(S) Registry has no credential,
 * and checking the signed-in account when every one has: a lookup that finds
 * nothing while signed in is as often an account without access as an
 * extension that does not exist.
 *
 * The credential store and the Registry selection are optional: an invocation
 * composed without them offers no hint rather than failing, and a selection
 * that cannot be decided omits the hint rather than guessing a default.
 */
export const registryLoginSuggestions = (
  endpoints: ReadonlyArray<RegistryEndpoint>,
): Effect.Effect<ReadonlyArray<SuggestedAction>> =>
  Effect.gen(function* () {
    const store = yield* Effect.serviceOption(CredentialStore);
    const context = yield* Effect.serviceOption(RegistryContext);
    if (Option.isNone(store) || Option.isNone(context)) return [];
    const defaultBound = yield* Effect.option(context.value.defaultBound);
    if (Option.isNone(defaultBound)) return [];
    const present = yield* hasCredentialsForAll(endpoints, defaultBound.value.endpoint).pipe(
      Effect.provideService(CredentialStore, store.value),
    );
    return present ? [ACCOUNT_SUGGESTION] : [LOGIN_SUGGESTION];
  });
