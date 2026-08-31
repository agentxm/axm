import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CredentialStore, resolveRequestToken } from "@agentxm/extension-management/unstable/auth";
import { RegistryUrl } from "@agentxm/extension-management/unstable/registry";

export interface RegistryLoginSuggestion {
  readonly description: string;
  readonly cmd: string;
}

const LOGIN_SUGGESTION: RegistryLoginSuggestion = {
  description: "Sign in to check whether the extension is private.",
  cmd: "axm login",
};

const remoteOrigins = (locations: ReadonlyArray<string>): ReadonlyArray<string> => {
  const origins = new Set<string>();
  for (const location of locations) {
    try {
      const url = new URL(location);
      if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
    } catch {
      // Invalid source locations are reported by their owning resolution path.
    }
  }
  return [...origins];
};

/**
 * Captures local auth services and returns an offline login-hint resolver.
 * The resolver never probes a registry. A successful ambient or stored token
 * suppresses the hint even when that identity cannot see the requested item.
 */
export const makeRegistryLoginSuggestionResolver = Effect.gen(function* () {
  const maybeStore = yield* Effect.serviceOption(CredentialStore);
  const maybeDefaultRegistry = yield* Effect.serviceOption(RegistryUrl);
  const maybeFileSystem = yield* Effect.serviceOption(FileSystem.FileSystem);

  if (Option.isNone(maybeStore) || Option.isNone(maybeDefaultRegistry)) {
    return (_locations: ReadonlyArray<string>) =>
      Effect.succeed<ReadonlyArray<RegistryLoginSuggestion>>([]);
  }

  const baseLayer = Layer.succeed(CredentialStore, maybeStore.value);
  const authLayer = Option.match(maybeFileSystem, {
    onNone: () => baseLayer,
    onSome: (fileSystem) =>
      Layer.merge(baseLayer, Layer.succeed(FileSystem.FileSystem, fileSystem)),
  });

  return (locations: ReadonlyArray<string>) =>
    Effect.forEach(remoteOrigins(locations), (origin) =>
      resolveRequestToken(origin, maybeDefaultRegistry.value).pipe(
        Effect.provide(authLayer),
        Effect.map(Option.isSome),
        Effect.catch(() => Effect.succeed(false)),
      ),
    ).pipe(
      Effect.map((hasCredentials) =>
        hasCredentials.some((hasCredential) => !hasCredential) ? [LOGIN_SUGGESTION] : [],
      ),
    );
});
