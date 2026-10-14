/**
 * RegistryContext — which Registry an invocation works with.
 *
 * The composition root decides it once per invocation, lazily: a command that
 * never touches a Registry never reads or validates the selection, and one
 * that does decides it when it first asks. A selection that cannot be made is
 * a typed failure; it never falls back to another Registry.
 *
 * Lives with the Registry transport so authentication depends on the
 * Registry client and never the reverse.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  parseRegistryEndpoint,
  sameRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

/** Why a Registry was selected. */
export type RegistrySelectionReason =
  "explicit-url" | "named-source" | "project-default" | "user-default" | "built-in";

/** A selected Registry: its configured name, canonical endpoint, and provenance. */
export interface BoundRegistry {
  /** The configured source name, or the canonical endpoint for an explicit URL. */
  readonly name: string;
  readonly endpoint: RegistryEndpoint;
  readonly reason: RegistrySelectionReason;
  /** The settings document that configured the selection, when one did. */
  readonly settingsPath: Option.Option<string>;
}

/**
 * The scope whose selection named a Registry source that is not configured:
 * an explicit selection, a settings default, or — when no settings name a
 * default — the built-in Registry this installation failed to configure.
 */
export type RegistrySelectionScope = "explicit" | "project" | "user" | "built-in";

/** A default or named Registry source that no settings configure. */
export class RegistrySourceUnknown extends Data.TaggedError("RegistrySourceUnknown")<{
  readonly name: string;
  readonly scope: RegistrySelectionScope;
  readonly settingsPath: Option.Option<string>;
}> {
  get detail(): string {
    switch (this.scope) {
      case "explicit":
        return `Registry source "${this.name}" is not configured.`;
      case "built-in":
        return `Built-in registry source "${this.name}" is not configured.`;
      case "project":
      case "user":
        return `Default registry source "${this.name}" is not configured.`;
    }
  }
}

/**
 * The selection could not be decided: its settings could not be read or are
 * invalid, or an explicit selection is not a Registry. `cause` is the typed
 * failure the composition root met, kept for its path-aware diagnostic.
 */
export class RegistrySelectionFailed extends Data.TaggedError("RegistrySelectionFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

export type RegistrySelectionFailure = RegistrySourceUnknown | RegistrySelectionFailed;

export interface RegistryContextService {
  /** The Registry this invocation's operation addresses: its explicit selection, else the default. */
  readonly bound: Effect.Effect<BoundRegistry, RegistrySelectionFailure>;
  /** The settings-selected default Registry, whatever the operation addresses. */
  readonly defaultBound: Effect.Effect<BoundRegistry, RegistrySelectionFailure>;
  /** The Registry a configured name or absolute HTTP(S) URL selects; the default when none. */
  readonly target: (
    selector: Option.Option<string>,
  ) => Effect.Effect<BoundRegistry, RegistrySelectionFailure>;
}

export class RegistryContext extends ServiceMap.Service<RegistryContext, RegistryContextService>()(
  "@agentxm/registry-client/registry-context/RegistryContext",
) {}

/**
 * A context whose selection is already decided: for tests and fixed
 * compositions. A selector targets only a Registry it decided, by name or
 * endpoint, so an operation that names any other Registry fails as it would
 * against settings that do not configure it.
 */
export const makeFixedRegistryContext = (
  bound: BoundRegistry,
  defaultBound: BoundRegistry = bound,
): RegistryContextService => {
  const selects = (registry: BoundRegistry, selector: string) => {
    if (registry.name === selector) return true;
    const endpoint = parseRegistryEndpoint(selector);
    return Result.isSuccess(endpoint) && sameRegistryEndpoint(endpoint.success, registry.endpoint);
  };
  return {
    bound: Effect.succeed(bound),
    defaultBound: Effect.succeed(defaultBound),
    target: (selector) => {
      if (Option.isNone(selector)) return Effect.succeed(defaultBound);
      const selected = [bound, defaultBound].find((registry) => selects(registry, selector.value));
      return selected === undefined
        ? Effect.fail(
            new RegistrySourceUnknown({
              name: selector.value,
              scope: "explicit",
              settingsPath: Option.none(),
            }),
          )
        : Effect.succeed(selected);
    },
  };
};
