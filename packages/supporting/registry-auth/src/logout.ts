/**
 * Sign-out: revoke the session at the Registry, then erase the selected
 * Registry's stored credentials.
 *
 * The local erase is unconditional. A remote revoke that fails leaves a token
 * that expires on its own, and the outcome says so rather than reporting a
 * clean sign-out.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { AuthLoginPresenter } from "./login-presenter.js";

/** What one `logout` invocation settled on. */
export type LogoutOutcome =
  | { readonly _tag: "NotSignedIn"; readonly registryHost: string }
  | {
      readonly _tag: "SignedOut";
      readonly registryHost: string;
      readonly handle?: string;
      /** False when the Registry did not confirm the revoke; the token expires on its own. */
      readonly revokedRemotely: boolean;
    };

/** `normalizeHandle("@unknown")` — the anonymous credential sentinel. */
const ANONYMOUS_HANDLE = "@unknown";

export const logout = Effect.fn("Logout.run")(function* (registryUrl: string) {
  const authClient = yield* AuthClient;
  const credentials = yield* CredentialStore;
  const presenter = yield* AuthLoginPresenter;
  const registryHost = new URL(registryUrl).host;

  const existing = yield* credentials.load(registryUrl);
  if (Option.isNone(existing)) {
    return { _tag: "NotSignedIn", registryHost } as const satisfies LogoutOutcome;
  }

  const revoked = yield* presenter.withProgress(
    { _tag: "RevokingRegistrySession", registryHost },
    () => authClient.revokeToken(existing.value.refresh_token).pipe(Effect.option),
  );
  yield* credentials.clear(registryUrl);

  const handle = existing.value.handle;
  return {
    _tag: "SignedOut",
    registryHost,
    ...(handle === ANONYMOUS_HANDLE ? {} : { handle }),
    revokedRemotely: Option.isSome(revoked),
  } as const satisfies LogoutOutcome;
});
