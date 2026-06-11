import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";

export interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

export const resolvePublishExtensionInputs = (
  extensions: ReadonlyArray<string>,
  getInstalledNames: (
    ws: WorkspaceMutationsService,
  ) => Effect.Effect<ReadonlyArray<string>, AppError, never>,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    const globPatterns = extensions.filter((extension) => isGlobPattern(extension));
    const literalInputs = extensions.filter((extension) => !isGlobPattern(extension));

    if (globPatterns.length === 0) return literalInputs;

    const installedNames = yield* getInstalledNames(ws);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      return [];
    }

    const seen = new Set<string>(globMatches);
    return [
      ...globMatches,
      ...literalInputs.filter((literal) => {
        if (seen.has(literal)) return false;
        seen.add(literal);
        return true;
      }),
    ];
  });

export const resolvePublishTargetRegistry = (
  registry: Option.Option<string>,
  options?: {
    readonly noRegistryError?: Parameters<typeof makeAppError>[0];
  },
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to get registry sources: ${error._tag}`,
          cause: error,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError(
        options?.noRegistryError ?? {
          code: "usage",
          detail: "No registry sources configured",
          suggestions: [{ description: "Run the registry guard first." }],
        },
      );
    }

    if (Option.isNone(registry)) {
      return {
        registryName: defaultRegistry.name,
        registryUrl: defaultRegistry.location.href,
      } satisfies TargetRegistry;
    }

    const namedRegistry = yield* ws.getConfiguredSourceByName(registry.value).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to lookup registry source "${registry.value}"`,
          cause: error,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });
