import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "../../app-error/index.js";
import { CredentialStore, getCurrentUserHandle } from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import { type Handle } from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { normalizeScaffoldOwner } from "./scaffold-name.js";
import { workspaceSettingsPath } from "./workspace-display-paths.js";
import { toAppError } from "../../app-error/conversions.js";

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
   * Record `owner` in the selected scope's settings, or `Effect.void` when the
   * scope already names it. Run it inside the authoring transaction so
   * establishment is atomic with the desired-state entry and absent from
   * preview.
   */
  readonly establish: Effect.Effect<void, AppError>;
}

/**
 * Owners the person could plausibly have meant, most local first.
 *
 * These are named in the refusal only. Neither the user-scope owner nor the
 * signed-in handle silently supplies authorship for the selected scope, because
 * creating under an owner the scope does not record leaves the workspace
 * failing its own desired-state invariant.
 */
const ownerCandidates = (
  ws: WorkspaceMutationsService,
): Effect.Effect<ReadonlyArray<Handle>, AppError, CredentialStore | RegistryUrl> =>
  Effect.gen(function* () {
    const configured = yield* ws.getConfiguredOwner().pipe(Effect.mapError(toAppError));
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

const ownerRequired = (
  target: AuthoringTarget,
  ws: WorkspaceMutationsService,
): Effect.Effect<never, AppError, CredentialStore | RegistryUrl> =>
  Effect.gen(function* () {
    const candidates = yield* ownerCandidates(ws);
    const [candidate] = candidates;
    const settings = workspaceSettingsPath(ws.scope);
    return yield* makeAppError({
      code: "validation",
      detail: `No owner configured for ${target.subject} creation`,
      suggestions: [
        candidate === undefined
          ? {
              description: `Name the owner to create under; it becomes the workspace owner in \`${settings}\`.`,
              cmd: `axm ${target.command} ${target.name} --owner @handle`,
            }
          : {
              description: `Create under ${candidates.join(" or ")}, recording it as the workspace owner in \`${settings}\`.`,
              cmd: `axm ${target.command} ${target.name} --owner ${candidate}`,
            },
      ],
    });
  });

/**
 * Resolve the owner every `new` command creates under.
 *
 * The selected workspace scope is the only silent source. An explicitly
 * requested owner must match a configured one, and establishes ownership when
 * the scope configures none. When neither is present the refusal names the
 * owners the person could have meant rather than resolving one for them.
 */
export const resolveAuthoringOwner = (
  target: AuthoringTarget,
  explicit: Option.Option<string>,
): Effect.Effect<AuthoringOwner, AppError, WorkspaceMutations | CredentialStore | RegistryUrl> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = ws.layout.owner;

    if (Option.isNone(explicit)) {
      if (configured === undefined) return yield* ownerRequired(target, ws);
      return { owner: configured, establish: Effect.void };
    }

    const requested = normalizeScaffoldOwner(explicit.value);
    if (configured === undefined) {
      return {
        owner: requested,
        establish: ws.setOwner(requested).pipe(Effect.mapError(toAppError)),
      };
    }
    if (configured !== requested) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Package owner ${requested} does not match workspace owner ${configured}`,
      });
    }
    return { owner: requested, establish: Effect.void };
  });
