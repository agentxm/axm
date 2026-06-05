import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  CredentialStore,
  getCurrentUserHandle,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { type Handle } from "@agentxm/client-core/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

const makeOwnerRequiredError = (action: string): AppError =>
  makeAppError({
    code: "internal",
    detail: `No owner configured for ${action}`,
    suggestions: [
      {
        description:
          "Set `owner` in `.axm/settings.json`, pass an explicit owner flag, or sign in.",
        cmd: "axm login",
      },
    ],
  });

/**
 * Resolve the owner that should be used when authoring new content
 * (new, scaffold). Cascade:
 *   1. Configured owner from project/global settings
 *   2. Locally-stored handle for the configured registry (if logged in)
 *   3. Optional fallback supplied by caller
 *   4. Fail with OWNER_REQUIRED.
 */
export const resolveOwnerForNewContent = (
  action: string,
  fallback?: Option.Option<Handle>,
): Effect.Effect<Handle, AppError, WorkspaceMutations | CredentialStore | RegistryUrl> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    const configured = yield* ws.getConfiguredOwner();
    if (Option.isSome(configured)) return configured.value;

    const registryUrl = yield* RegistryUrl;
    const loggedIn = yield* getCurrentUserHandle(registryUrl);
    if (Option.isSome(loggedIn)) return loggedIn.value;

    if (fallback && Option.isSome(fallback)) return fallback.value;

    return yield* makeOwnerRequiredError(action);
  });
