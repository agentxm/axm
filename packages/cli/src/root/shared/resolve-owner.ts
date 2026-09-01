import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { CredentialStore, getCurrentUserHandle } from "@agentxm/registry-auth";
import { registryAuthFailureToAppError } from "../../feature-errors.js";
import { RegistryUrl } from "@agentxm/registry-client";
import { type Handle } from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { workspaceSettingsPath } from "./workspace-display-paths.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

const makeOwnerRequiredError = (action: string, scope: WorkspaceScope): AppError =>
  makeAppError({
    code: "validation",
    detail: `No owner configured for ${action}`,
    suggestions: [
      {
        description: `Set \`owner\` in \`${workspaceSettingsPath(scope)}\`, pass an explicit owner flag, or sign in.`,
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

    const configured = yield* ws.getConfiguredOwner().pipe(Effect.mapError(toAppError));
    if (Option.isSome(configured)) return configured.value;

    const registryUrl = yield* RegistryUrl;
    const loggedIn = yield* getCurrentUserHandle(registryUrl).pipe(
      Effect.mapError(registryAuthFailureToAppError),
    );
    if (Option.isSome(loggedIn)) return loggedIn.value;

    if (fallback && Option.isSome(fallback)) return fallback.value;

    return yield* makeOwnerRequiredError(action, ws.scope);
  });
