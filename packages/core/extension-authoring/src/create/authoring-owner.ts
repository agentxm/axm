/**
 * The owner every authored package is created under.
 *
 * The selected workspace scope is the only silent source. An explicitly
 * requested owner must match a configured one, and establishes ownership when
 * the scope configures none. When neither is present the refusal names the
 * owners the person could have meant rather than resolving one for them:
 * creating under an owner the scope does not record leaves the workspace
 * failing its own desired-state invariant.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import { CredentialStore, getCurrentUserHandle } from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";

import { AuthoringOwnerMismatch, AuthoringOwnerRequired } from "./errors.js";
import { normalizeScaffoldOwner } from "./scaffold-name.js";

/** The `axm <type> new <name>` invocation named in an ownership refusal. */
export interface AuthoringTarget {
  /** Subject named in the refusal, e.g. `skill`. */
  readonly subject: string;
  /** Command route named in the recovery action, e.g. `skills new`. */
  readonly command: string;
  /** Name being created, so the recovery action is a runnable command. */
  readonly name: string;
}

export interface AuthoringOwner {
  /** The owner the new package and its workspace declaration carry. */
  readonly owner: Handle;
  /**
   * Record `owner` in the selected scope's settings, or `Effect.void` when
   * the scope already names it. It runs inside the authoring transaction, so
   * establishment is atomic with the desired-state entry and absent from
   * preview.
   */
  readonly establish: Effect.Effect<void, WorkspaceSettingsMutationFailure>;
}

/** The settings file that records ownership, relative to the workspace root. */
export const settingsRelativePath = (path: Path.Path, ws: WorkspaceMutationsService): string =>
  path.relative(ws.baseDir, ws.layout.settingsPath);

/**
 * Owners the person could plausibly have meant, most local first.
 *
 * These are named in the refusal only. Neither the user-scope owner nor the
 * signed-in handle silently supplies authorship for the selected scope.
 */
const ownerCandidates = (
  ws: WorkspaceMutationsService,
): Effect.Effect<
  ReadonlyArray<Handle>,
  WorkspaceSettingsReadFailure,
  CredentialStore | RegistryUrl
> =>
  Effect.gen(function* () {
    const configured = yield* ws.getConfiguredOwner();
    const registryUrl = yield* RegistryUrl;
    // A keychain that cannot be read must not mask the ownership refusal that
    // this lookup only decorates.
    const loggedIn = yield* getCurrentUserHandle(registryUrl).pipe(
      Effect.catch(() => Effect.succeed(Option.none<Handle>())),
    );
    const candidates = new Set<Handle>();
    if (Option.isSome(configured)) candidates.add(configured.value);
    if (Option.isSome(loggedIn)) candidates.add(loggedIn.value);
    return Array.from(candidates);
  });

/**
 * Resolve the owner an authoring command creates under, or refuse with the
 * facts that make the refusal recoverable.
 */
export const resolveAuthoringOwner = (
  target: AuthoringTarget,
  explicit: Option.Option<string>,
): Effect.Effect<
  AuthoringOwner,
  AuthoringOwnerRequired | AuthoringOwnerMismatch | WorkspaceSettingsReadFailure,
  WorkspaceMutations | Path.Path | CredentialStore | RegistryUrl
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const configured = ws.layout.owner;

    if (Option.isNone(explicit)) {
      if (configured === undefined) {
        return yield* new AuthoringOwnerRequired({
          subject: target.subject,
          command: target.command,
          name: target.name,
          candidates: yield* ownerCandidates(ws),
          settingsPath: settingsRelativePath(path, ws),
        });
      }
      return { owner: configured, establish: Effect.void };
    }

    const requested = normalizeScaffoldOwner(explicit.value);
    if (configured === undefined) {
      return { owner: requested, establish: ws.setOwner(requested) };
    }
    if (configured !== requested) {
      return yield* new AuthoringOwnerMismatch({ requested, configured });
    }
    return { owner: requested, establish: Effect.void };
  });

/**
 * Require an already-authored package's identity to agree with the selected
 * workspace. Fork, adopt, and native import carry an owner in the identity
 * they were given, so they confirm rather than resolve.
 */
export const requireAuthoredOwner = (
  owner: Handle,
  target: Pick<AuthoringTarget, "subject" | "command">,
): Effect.Effect<
  void,
  AuthoringOwnerRequired | AuthoringOwnerMismatch,
  WorkspaceMutations | Path.Path
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const configured = ws.layout.owner;
    if (configured === undefined) {
      return yield* new AuthoringOwnerRequired({
        subject: target.subject,
        command: target.command,
        name: owner,
        candidates: [owner],
        settingsPath: settingsRelativePath(path, ws),
      });
    }
    if (configured !== owner) {
      return yield* new AuthoringOwnerMismatch({ requested: owner, configured });
    }
  });
