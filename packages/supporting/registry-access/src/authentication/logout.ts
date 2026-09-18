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

import { TokenExchange } from "./auth-client.js";
import { CredentialStore } from "../credentials/credential-store.js";
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
  const exchange = yield* TokenExchange;
  const credentials = yield* CredentialStore;
  const presenter = yield* AuthLoginPresenter;
  const registryHost = new URL(registryUrl).host;
  const notSignedIn = { _tag: "NotSignedIn", registryHost } as const satisfies LogoutOutcome;

  if (Option.isNone(yield* credentials.load(registryUrl))) return notSignedIn;

  // Sign-out holds the refresh lock and reads the session again inside it. A
  // renewal in another invocation would otherwise write its rotated session
  // back after the erase, and the refresh token revoked here would be one that
  // renewal had already spent.
  return yield* credentials.withRefreshLock(
    Effect.gen(function* () {
      const stored = yield* credentials.reload(registryUrl);
      if (Option.isNone(stored)) return notSignedIn;

      const revokedRemotely = yield* presenter.withProgress(
        { _tag: "RevokingRegistrySession", registryHost },
        () =>
          exchange.revokeToken(stored.value.refresh_token, registryUrl).pipe(
            Effect.as(true),
            Effect.catch((error) =>
              Effect.logWarning(
                `${error.detail ?? "Token revocation failed."} Local credentials will still be cleared.`,
              ).pipe(Effect.as(false)),
            ),
          ),
      );
      yield* credentials.clear(registryUrl);

      const handle = stored.value.handle;
      return {
        _tag: "SignedOut",
        registryHost,
        ...(handle === ANONYMOUS_HANDLE ? {} : { handle }),
        revokedRemotely,
      } as const satisfies LogoutOutcome;
    }),
  );
});
