/**
 * RegistryClientFactory — the one place a Registry client is built.
 *
 * Constructing a client needs transport services (HTTP, file system, path)
 * that belong to the composition root, and which Registry a client speaks to
 * is a workspace decision. Features therefore keep this factory in `R` and
 * ask it for a client by validated endpoint; they never build a client
 * themselves.
 *
 * Every transport's client serves reads, publication, and visibility; a file
 * Registry implements nothing that needs a server, so `lifecycle` and `wire`
 * check the endpoint's transport before building anything and refuse a file
 * Registry before any request, credential, or file is touched. An HTTP(S)
 * client travels on the Registry transport, confined to its origin, refusing
 * redirects, and authorized for that origin alone; a file client is opened at
 * the native directory its `file:` URL names (percent-decoded, so
 * `file:///tmp/my%20registry` is `/tmp/my registry`).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import { randomUUID } from "node:crypto";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Ref from "effect/Ref";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as Fiber from "effect/Fiber";
import { makeLiveRegistryReadPhase, type RegistryReadPhaseService } from "./read-phase.js";
import type * as HttpClient from "effect/http/HttpClient";
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  isHttpRegistryEndpoint,
  type HttpRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import type { RegistryClient } from "./client.js";
import { makeUserArchiveCache } from "./archive-cache.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { makeRegistryLifecycleClient, type RegistryLifecycleClient } from "./admin-client.js";
import { requireHttpRegistryEndpoint } from "./capabilities.js";
import { RegistryRequestFailed, type RegistryOperationUnsupported } from "./errors.js";
import type { RegistryRequestPolicy } from "./request-policy.js";
import {
  RegistryHttpClient,
  RegistryRequestAuthorization,
  RegistryAuthorityContext,
  registryWire,
  type RegistryRequestAuthorizationService,
} from "./registry-transport.js";

export interface RegistryClientFactoryService {
  /** A fresh metadata observation phase, including nested calls made by the effect. */
  readonly withReadPhase: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  /** End the current phase before mutation; later queries must open a fresh phase. */
  readonly invalidateReadPhase: Effect.Effect<void>;
  readonly authorityContext: (
    endpoint: RegistryEndpoint,
  ) => Effect.Effect<RegistryAuthorityContext, RegistryRequestFailed>;
  /**
   * A client for one Registry. Every transport serves its reads,
   * publication, and visibility, so building one is never refused.
   */
  readonly forEndpoint: (
    endpoint: RegistryEndpoint,
    options?: { readonly requestPolicy?: RegistryRequestPolicy },
  ) => Effect.Effect<RegistryClient, Config.ConfigError>;
  /** Lifecycle management for one Registry; refused for a file Registry. */
  readonly lifecycle: (
    endpoint: RegistryEndpoint,
    operation: string,
  ) => Effect.Effect<RegistryLifecycleClient, RegistryOperationUnsupported>;
  /**
   * The authorized transport an HTTP(S) Registry's authentication API
   * travels on: confined to its origin, refusing redirects, and presenting
   * the invocation's credential. Refused for a file Registry.
   */
  readonly wire: (
    endpoint: RegistryEndpoint,
    options: { readonly operation: string },
  ) => Effect.Effect<
    { readonly endpoint: HttpRegistryEndpoint; readonly httpClient: HttpClient.HttpClient },
    RegistryOperationUnsupported
  >;
}

export class RegistryClientFactory extends ServiceMap.Service<
  RegistryClientFactory,
  RegistryClientFactoryService
>()("@agentxm/registry-client/registry-client-factory/RegistryClientFactory") {}

/**
 * Build the factory over the Registry transport. Every HTTP(S) client it
 * builds travels on `authorization` applied to the plain Registry wire.
 */
export const makeRegistryClientFactory = Effect.fn("RegistryClientFactory.make")(
  function* (services: {
    readonly httpClient: HttpClient.HttpClient;
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly authorization: RegistryRequestAuthorizationService;
  }) {
    const fileAuthority = new RegistryAuthorityContext({ id: randomUUID(), generation: 0 });
    // Cache availability belongs to this invocation. A failed cache configuration
    // disables remote archive clients without preventing file, lifecycle, or auth
    // operations that never use the cache. Every remote client shares this result
    // and, when available, the same acquisition and pruning state.
    const archiveCache = yield* makeUserArchiveCache().pipe(
      Effect.provideService(FileSystem.FileSystem, services.fileSystem),
      Effect.provideService(Path.Path, services.path),
      Effect.result,
    );
    const transport = (endpoint: HttpRegistryEndpoint) =>
      services.authorization.authorize(endpoint, registryWire(endpoint, services.httpClient));

    const rawForEndpoint: RegistryClientFactoryService["forEndpoint"] = (endpoint, options) =>
      Effect.gen(function* () {
        if (!isHttpRegistryEndpoint(endpoint)) {
          return createLocalRegistryClient(
            fromFileLocation(endpoint.href),
            services.fileSystem,
            services.path,
          );
        }
        if (Result.isFailure(archiveCache)) return yield* Effect.fail(archiveCache.failure);
        return createRemoteRegistryClient(
          endpoint,
          transport(endpoint),
          services.authorization.currentContext(endpoint),
          archiveCache.success,
          options?.requestPolicy,
        );
      });

    const authorityContext: RegistryClientFactoryService["authorityContext"] = (endpoint) =>
      isHttpRegistryEndpoint(endpoint)
        ? services.authorization.currentContext(endpoint)
        : Effect.succeed(fileAuthority);
    // Explicit policy overrides have independent budgets and therefore cannot
    // borrow requests executed under another client's policy.
    const policies = new Map<string, RegistryRequestPolicy>();
    const policyIds = new WeakMap<RegistryRequestPolicy, string>();
    const currentPhase = ServiceMap.Reference<
      (RegistryReadPhaseService & { readonly invalidate: Effect.Effect<void> }) | undefined
    >(`@agentxm/registry-client/read-phase/${randomUUID()}`, { defaultValue: () => undefined });
    const withReadPhase: RegistryClientFactoryService["withReadPhase"] = (effect) =>
      Effect.acquireUseRelease(
        Scope.make(),
        (scope) =>
          Effect.gen(function* () {
            const open = yield* Ref.make(true);
            const phase = yield* makeLiveRegistryReadPhase(
              authorityContext,
              (endpoint, policy) => {
                const requestPolicy = policies.get(policy);
                return rawForEndpoint(
                  endpoint,
                  requestPolicy === undefined ? undefined : { requestPolicy },
                );
              },
              scope,
            );
            yield* Scope.addFinalizer(scope, Effect.andThen(Ref.set(open, false), phase.clear));
            const guarded = {
              invalidate: Scope.close(scope, Exit.void),
              clear: phase.clear,
              getMany: (endpoint, args, policy) =>
                Effect.gen(function* () {
                  if (!(yield* Ref.get(open)))
                    return yield* new RegistryRequestFailed({
                      category: "conflict",
                      detail: "Registry metadata read phase has ended.",
                    });
                  return yield* Effect.acquireUseRelease(
                    Effect.forkIn(phase.getMany(endpoint, args, policy), scope),
                    Fiber.join,
                    Fiber.interrupt,
                  );
                }),
              get: (endpoint, args, policy) =>
                Effect.gen(function* () {
                  if (!(yield* Ref.get(open)))
                    return yield* new RegistryRequestFailed({
                      category: "conflict",
                      detail: "Registry metadata read phase has ended.",
                    });
                  return yield* Effect.acquireUseRelease(
                    Effect.forkIn(phase.get(endpoint, args, policy), scope),
                    Fiber.join,
                    Fiber.interrupt,
                  );
                }),
            } satisfies RegistryReadPhaseService & { readonly invalidate: Effect.Effect<void> };
            return yield* Effect.provideService(effect, currentPhase, guarded);
          }),
        (scope, exit) => Scope.close(scope, exit),
      );
    const forEndpoint: RegistryClientFactoryService["forEndpoint"] = (endpoint, options) =>
      Effect.gen(function* () {
        const client = yield* rawForEndpoint(endpoint, options);
        let policy = "default";
        if (options?.requestPolicy !== undefined) {
          const existing = policyIds.get(options.requestPolicy);
          policy = existing ?? randomUUID();
          policyIds.set(options.requestPolicy, policy);
          policies.set(policy, options.requestPolicy);
        }
        const getExtensionIndex: RegistryClient["getExtensionIndex"] = (args) => {
          const read = Effect.flatMap(currentPhase, (phase) =>
            phase === undefined
              ? withReadPhase(
                  Effect.flatMap(currentPhase, (active) =>
                    active === undefined
                      ? Effect.die("Registry read phase was not installed")
                      : active.get(endpoint, args, policy),
                  ),
                )
              : phase.get(endpoint, args, policy),
          );
          return read.pipe(
            Effect.mapError((error) =>
              error._tag === "ConfigError"
                ? new RegistryRequestFailed({
                    category: "internal",
                    detail: "Registry client configuration is unavailable.",
                  })
                : error,
            ),
          );
        };
        const selectMany: RegistryClient["selectMany"] = (args) => {
          const read = Effect.flatMap(currentPhase, (phase) =>
            phase === undefined
              ? withReadPhase(
                  Effect.flatMap(currentPhase, (active) =>
                    active === undefined
                      ? Effect.die("Registry read phase was not installed")
                      : active.getMany(endpoint, args, policy),
                  ),
                )
              : phase.getMany(endpoint, args, policy),
          );
          return read.pipe(
            Effect.map((results) =>
              results.map((result) =>
                Result.mapError(result, (failure) =>
                  failure._tag === "ConfigError"
                    ? new RegistryRequestFailed({
                        category: "internal",
                        detail: "Registry client configuration is unavailable.",
                      })
                    : failure,
                ),
              ),
            ),
          );
        };
        return { ...client, getExtensionIndex, selectMany } satisfies RegistryClient;
      });

    return {
      authorityContext,
      withReadPhase,
      invalidateReadPhase: Effect.flatMap(
        currentPhase,
        (phase) => phase?.invalidate ?? Effect.void,
      ),
      forEndpoint,
      lifecycle: (endpoint, operation) =>
        Effect.map(requireHttpRegistryEndpoint(endpoint, "lifecycle", operation), (http) =>
          makeRegistryLifecycleClient(http, transport(http)),
        ),
      wire: (endpoint, options) =>
        Effect.map(requireHttpRegistryEndpoint(endpoint, "auth", options.operation), (http) => ({
          endpoint: http,
          httpClient: transport(http),
        })),
    } satisfies RegistryClientFactoryService;
  },
);

/**
 * The authorized factory every feature uses. The transport services are
 * bound once, here, at the composition root; every member the factory hands
 * out is already `R = never`.
 */
export const RegistryClientFactoryLive: Layer.Layer<
  RegistryClientFactory,
  never,
  RegistryHttpClient | RegistryRequestAuthorization | FileSystem.FileSystem | Path.Path
> = Layer.effect(
  RegistryClientFactory,
  Effect.gen(function* () {
    return yield* makeRegistryClientFactory({
      httpClient: yield* RegistryHttpClient,
      fileSystem: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      authorization: yield* RegistryRequestAuthorization,
    });
  }),
);

/** Start a fresh shared metadata observation at a feature boundary. */
export const withRegistryReadPhase = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | RegistryClientFactory> =>
  Effect.flatMap(RegistryClientFactory, (factory) => factory.withReadPhase(effect));
