/**
 * The invocation's Registry selection, decided from the fixture workspace's
 * settings exactly as the executable decides it.
 *
 * `snapshot` reads the project and user settings as the executable reads
 * them (the caller composes it, e.g. with `readProjectSourceConfiguration`
 * over {@link testBuiltInSources}). Selection is read on every request rather
 * than once, so an example that rewrites its settings observes the new
 * selection.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  RegistryContext,
  RegistrySelectionFailed,
  type RegistryContextService,
} from "@agentxm/registry-client";
import { testRegistryUrl } from "@agentxm/registry-client/testing";
import {
  BUILT_IN_REGISTRY_NAME,
  selectRegistry,
  type SourceConfigurationSnapshot,
} from "@agentxm/workspace-kernel/workspace-state";

/** The built-in Registry the executable always knows, served at `url`. */
export const testBuiltInSources = (
  url: string = testRegistryUrl,
): SourceConfigurationSnapshot["builtInSources"] => [
  { name: BUILT_IN_REGISTRY_NAME, type: "registry", location: decodeRegistryEndpointSync(url) },
];

export const SettingsRegistryContextTest = <E, R>(options: {
  /** Reads the settings that, with the built-ins, select the Registry. */
  readonly snapshot: Effect.Effect<SourceConfigurationSnapshot, E, R>;
  /** The `--registry` selection the invocation carries. */
  readonly explicit?: Option.Option<string>;
}): Layer.Layer<RegistryContext, never, R> =>
  Layer.effect(
    RegistryContext,
    Effect.gen(function* () {
      const services = yield* Effect.context<R>();
      const snapshot = options.snapshot.pipe(
        Effect.provide(services),
        Effect.mapError(
          (cause) =>
            new RegistrySelectionFailed({
              detail: "The settings that select the Registry could not be read.",
              cause,
            }),
        ),
      );
      const select = (selector: Option.Option<string>) =>
        Effect.flatMap(snapshot, (current) => Effect.fromResult(selectRegistry(current, selector)));
      return {
        bound: select(options.explicit ?? Option.none()),
        defaultBound: select(Option.none()),
        target: select,
      } satisfies RegistryContextService;
    }),
  );
