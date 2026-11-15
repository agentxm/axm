/**
 * Driving release verification from this package's own specifications.
 *
 * Three Registry worlds, none of which leaves the process:
 *
 * - a memory world: a recording Registry port answering from a catalog, and
 *   an in-memory file system holding saved publish results. Every Registry
 *   call the use case makes is recorded, so a refusal before any Registry
 *   request is observable as an empty record.
 * - a file world: the production Registry client over a real `file://`
 *   Registry, with a transport that refuses every request.
 * - an HTTP world: the production Registry client and archive cache over a
 *   controlled HTTP Registry that records every request, with the user home
 *   isolated so no example touches the real archive cache.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
  formatFqn,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  RegistryAuthorityContext,
  RegistryClientFactory,
  RegistryRequestFailed,
  type RegistryClient,
  type RegistryClientFactoryService,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import {
  makeFileRegistry,
  OfflineHttpClient,
  RegistryClientFactoryTest,
  RegistryContextTest,
  testRegistryUrl,
} from "@agentxm/registry-client/testing";
import { ExtensionIndexSchema } from "@agentxm/registry-protocol/unstable/registry";
import { decodeResolutionRequestBody } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";

import { normalizePublishResult, type PublishResult } from "../publish/result.js";
import { parseReleaseReference } from "./reference.js";
import type { ReleaseReference } from "./reference.js";
import type { ReleaseVerificationRequest } from "../index.js";

const decodeIndex = Schema.decodeUnknownSync(ExtensionIndexSchema);

export const sri = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** A deterministic SRI value naming no particular bytes. */
export const digestOf = (label: string): string => sri(new TextEncoder().encode(label));

/** Parse references the way the application does before it builds a request. */
export const references = (...inputs: ReadonlyArray<string>): ReadonlyArray<ReleaseReference> =>
  inputs.map((input) =>
    Result.getOrThrowWith(parseReleaseReference(input), (issue) => new Error(issue.detail)),
  );

/** A verification of exact references, optionally with an expected integrity. */
export const referenceRequest = (
  inputs: ReadonlyArray<string>,
  options: { readonly integrity?: string; readonly registry?: string } = {},
): ReleaseVerificationRequest => ({
  registry: Option.fromUndefinedOr(options.registry),
  selection: {
    mode: "references",
    references: references(...inputs),
    integrity: Option.fromUndefinedOr(options.integrity),
  },
});

/** A verification of one saved publish result. */
export const publishResultRequest = (
  path: string,
  options: { readonly registry?: string } = {},
): ReleaseVerificationRequest => ({
  registry: Option.fromUndefinedOr(options.registry),
  selection: { mode: "publish-result", path },
});

// -----------------------------------------------------------------------------
// Saved publish results
// -----------------------------------------------------------------------------

/** One publication-set item a saved publish result reports. */
interface PublishedItemFixture {
  readonly name: string;
  readonly version: string;
  readonly type?: ExtensionType;
  /** An upload candidate carries its prepared integrity; an existing version carries none. */
  readonly prepared?: string;
  /** Defaults to `publish` for an upload candidate and `verified-existing` otherwise. */
  readonly participation?: PublishResult["publicationSet"]["items"][number]["participation"];
  readonly status?: PublishResult["execution"]["outcomes"][number]["status"];
  readonly settlement?: "response" | "readback" | "replay" | "unresolved";
}

const archiveEvidence = (integrity: string) => ({
  included: [],
  excluded: [],
  patterns: [],
  patternCoverage: {
    explicit: "all",
    inherited: "matched-only",
    omittedInheritedCount: 0,
  } as const,
  warnings: [],
  includedCount: 1,
  excludedCount: 0,
  uncompressedBytes: 1,
  zipBytes: 1,
  integrity,
});

/** A `publish-result-v3` payload with the given admitted items, built by the feature's own normalizer. */
export const publishResult = (
  items: ReadonlyArray<PublishedItemFixture>,
  options: {
    readonly registry?: string;
    readonly status?: PublishResult["publicationSet"]["status"];
    /** A preview prepares archives but runs nothing: upload candidates stay pending. */
    readonly mode?: PublishResult["mode"];
  } = {},
): PublishResult => {
  const mode = options.mode ?? "apply";
  const owner = decodeHandleSync("@acme");
  const entries = items.map((item) => {
    const type = item.type ?? "skill";
    const name = decodeExtensionNameSync(item.name);
    const version = decodeVersionSync(item.version);
    return { item, type, name, version, id: formatFqn({ owner, type, name }) };
  });
  return normalizePublishResult({
    mode,
    selection: {
      mode: "explicit",
      scope: "project",
      owners: [owner],
      types: [],
      registry: options.registry ?? "agentxm",
      decisions: [],
    },
    publicationSet: {
      status: options.status ?? "admitted",
      items: entries.map(({ item, type, name, version, id }, selectionOrder) => ({
        id,
        owner,
        type,
        name,
        version,
        participation:
          item.participation ?? (item.prepared === undefined ? "verified-existing" : "publish"),
        dependencyIds: [],
        dependencyResolutions: [],
        selectionOrder,
        dependencyOrder: 0,
      })),
      findings: [],
    },
    results: entries.map(({ item, type, name, version, id }) =>
      item.prepared === undefined
        ? {
            id,
            owner,
            type,
            name,
            version,
            action: "skip" as const,
            phase: "authoritative_preflight" as const,
            reason: "version_already_published" as const,
            status: "success" as const,
          }
        : mode === "preview"
          ? {
              id,
              owner,
              type,
              name,
              version,
              action: "publish" as const,
              phase: "authoritative_preflight" as const,
              reason: "selected" as const,
              status: "pending" as const,
              archive: archiveEvidence(item.prepared),
            }
          : {
              id,
              owner,
              type,
              name,
              version,
              action: "publish" as const,
              phase: "upload_execution" as const,
              reason: "selected" as const,
              status: item.status ?? "success",
              archive: archiveEvidence(item.prepared),
              ...(item.settlement === undefined ? {} : { settlement: item.settlement }),
            },
    ),
  });
};

/** What `axm publish --json` writes: the envelope, with `mode` promoted out of `result`. */
export const savedEnvelope = (result: PublishResult): string => {
  const { mode, ...payload } = result;
  return JSON.stringify({
    ok: true,
    mode,
    outcome: mode === "preview" ? "previewed" : "completed",
    result: payload,
  });
};

/** The envelope's `result` extracted on its own: a bare result without `mode`. */
export const savedBareResult = (result: PublishResult): string => {
  const { mode: _mode, ...payload } = result;
  return JSON.stringify(payload);
};

// -----------------------------------------------------------------------------
// Memory world
// -----------------------------------------------------------------------------

/** One version a memory Registry lists. */
interface MemoryVersion {
  readonly version: string;
  readonly integrity: string;
  readonly published?: string;
  readonly yankedAt?: string;
  readonly yankCategory?: string;
  readonly yankMessage?: string;
}

interface MemoryWorldOptions {
  /** Listed versions by `@owner/<plural-type>/<name>`; an absent extension has no metadata. */
  readonly extensions?: Readonly<Record<string, ReadonlyArray<MemoryVersion>>>;
  /** A per-identity selection failure, by `@owner/<plural-type>/<name>`. */
  readonly selectionFailure?: (fqn: string) => RegistryClientFailure | undefined;
  /** A per-identity admission refusal, by `@owner/<plural-type>/<name>`. */
  readonly admissionFailure?: (fqn: string) => RegistryClientFailure | undefined;
  /** A failure of the whole admission scope, as when credentials change during admission. */
  readonly admissionScopeFailure?: RegistryClientFailure;
  /** Saved files by absolute path. */
  readonly files?: Readonly<Record<string, string>>;
}

/** One Registry call the use case made, named by operation, with the identities it addressed. */
interface RecordedRegistryCall {
  readonly operation: string;
  readonly subjects: ReadonlyArray<string>;
}

/** The Registry identity a call addresses, as `@owner/<plural-type>/<name>[@version]`. */
const subjectOf = (args: {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly exact?: { readonly version: string } | undefined;
}): string => `${formatFqn(args)}${args.exact === undefined ? "" : `@${args.exact.version}`}`;

/**
 * A recording Registry port and in-memory file system. Only selection,
 * admission and admitted reads answer; every other Registry operation is
 * recorded and fails the example.
 */
export const makeMemoryWorld = (options: MemoryWorldOptions = {}) => {
  const calls: Array<RecordedRegistryCall> = [];
  const unexpected = (operation: string) => () =>
    Effect.suspend(() => {
      calls.push({ operation, subjects: [] });
      return Effect.die(`Release verification must not call ${operation}`);
    });
  const client: RegistryClient = {
    selectMany: (identities) =>
      Effect.sync(() => {
        calls.push({ operation: "selectMany", subjects: identities.map(subjectOf) });
        return identities.map((identity) => {
          const fqn = subjectOf(identity);
          const failure = options.selectionFailure?.(fqn);
          if (failure !== undefined) return Result.fail(failure);
          const versions = options.extensions?.[fqn];
          return Result.succeed(
            versions === undefined
              ? Option.none()
              : Option.some(
                  decodeIndex({
                    owner: identity.owner,
                    type: identity.type,
                    name: identity.name,
                    publisherBindingId: "hbnd_memory",
                    archival: null,
                    deprecation: null,
                    versions: versions.map((entry) => ({
                      ...entry,
                      published: entry.published ?? "2026-11-14T10:02:11Z",
                    })),
                  }),
                ),
          );
        });
      }),
    withAccessibleContent: (args, use) =>
      Effect.gen(function* () {
        calls.push({ operation: "withAccessibleContent", subjects: args.map(subjectOf) });
        if (options.admissionScopeFailure !== undefined)
          return yield* options.admissionScopeFailure;
        return yield* use({
          results: args.map((entry) => {
            const failure = options.admissionFailure?.(
              subjectOf({ owner: entry.owner, type: entry.type, name: entry.name }),
            );
            return failure === undefined ? Result.succeed(undefined) : Result.fail(failure);
          }),
          read: (entry) =>
            Effect.sync(() => {
              calls.push({ operation: "read", subjects: [subjectOf(entry)] });
              return { archive: new Uint8Array() };
            }),
        });
      }),
    validateExtensionAccessBatch: unexpected("validateExtensionAccessBatch"),
    getExtensionsByScope: unexpected("getExtensionsByScope"),
    ownerExists: unexpected("ownerExists"),
    getExtensionIndex: unexpected("getExtensionIndex"),
    getExactExtensionVersion: unexpected("getExactExtensionVersion"),
    getExtensionPackage: unexpected("getExtensionPackage"),
    publishExtension: unexpected("publishExtension"),
    previewExtensionPublishes: unexpected("previewExtensionPublishes"),
    getExtensionVisibility: unexpected("getExtensionVisibility"),
    updateExtensionVisibility: unexpected("updateExtensionVisibility"),
    extensionExists: unexpected("extensionExists"),
    discoverPackages: unexpected("discoverPackages"),
  };
  const factory: RegistryClientFactoryService = {
    withReadPhase: (effect) =>
      Effect.suspend(() => {
        calls.push({ operation: "withReadPhase", subjects: [] });
        return effect;
      }),
    invalidateReadPhase: Effect.void,
    authorityContext: () =>
      Effect.succeed(new RegistryAuthorityContext({ id: "memory-authority", generation: 0 })),
    forEndpoint: () => Effect.succeed(client),
    lifecycle: unexpected("lifecycle"),
    wire: unexpected("wire"),
  };
  const noFiles = FileSystem.makeNoop({});
  const services = Layer.mergeAll(
    Layer.succeed(RegistryClientFactory, factory),
    RegistryContextTest(testRegistryUrl),
    FileSystem.layerNoop({
      readFileString: (path) => {
        const text = options.files?.[path];
        return text === undefined ? noFiles.readFileString(path) : Effect.succeed(text);
      },
    }),
  );
  return {
    calls,
    /** Registry calls other than opening the read phase. */
    registryCalls: () => calls.filter((call) => call.operation !== "withReadPhase"),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
  };
};

// -----------------------------------------------------------------------------
// File world
// -----------------------------------------------------------------------------

/** The production Registry client over a real `file://` Registry and a refusing transport. */
export const makeFileWorld = () => {
  const registry = makeFileRegistry();
  const services = Layer.mergeAll(
    RegistryContextTest(registry.url),
    Layer.provide(RegistryClientFactoryTest(OfflineHttpClient), NativePlatformTest),
    NativePlatformTest,
  );
  return {
    registry,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: registry.cleanup,
  };
};

// -----------------------------------------------------------------------------
// HTTP world
// -----------------------------------------------------------------------------

/** One skill version the controlled HTTP Registry serves. */
interface HttpRelease {
  readonly name: string;
  readonly version: string;
  /** The bytes whose digest the Registry records. */
  readonly archive: Uint8Array;
  /** The bytes a download actually returns; defaults to {@link archive}. */
  readonly served?: Uint8Array;
}

/** One request the controlled HTTP Registry observed. */
interface ObservedHttpRequest {
  readonly method: string;
  readonly path: string;
  readonly purpose?: "select" | "authorize-exact";
  readonly names: ReadonlyArray<string>;
  /** The `x-agentxm-usage-purpose` header an archive download carried. */
  readonly usagePurpose?: string;
}

export interface HttpWorldOptions {
  readonly releases: ReadonlyArray<HttpRelease>;
  /** Answer one release's archive download with this 403 problem body, by extension name. */
  readonly archiveProblem?: (name: string) => Readonly<Record<string, unknown>> | undefined;
  /** Fail a whole selection exchange in transport, before any response, for these names. */
  readonly dropSelection?: (names: ReadonlyArray<string>) => boolean;
  /** Replace one admission outcome, by extension name. */
  readonly admission?: (name: string) => Readonly<Record<string, unknown>> | undefined;
  /** Refuse every request before dispatch, as `--offline` does. */
  readonly offline?: boolean;
}

const observedAt = "2026-11-14T10:00:00Z";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The archive bytes of one release: distinct per name and version, never a real ZIP. */
export const archiveBytes = (label: string): Uint8Array => new TextEncoder().encode(label);

/**
 * The production Registry client and archive cache over a controlled HTTP
 * Registry. Every request is recorded; the user home is a temporary
 * directory, so the archive cache it holds is observable and disposable.
 */
export const makeHttpWorld = (options: HttpWorldOptions) => {
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-verify-home-")));
  const requests: Array<ObservedHttpRequest> = [];
  const byName = (name: string) => options.releases.filter((release) => release.name === name);
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      const path = new URL(request.url).pathname;
      if (options.offline === true) {
        requests.push({ method: request.method, path, names: [] });
        return yield* new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new RegistryRequestFailed({
              reason: "network-required",
              category: "network",
              detail:
                "network-required: This operation requires network access, which --offline prohibits.",
            }),
            description: "Network access is disabled.",
          }),
        });
      }
      if (path === "/v1/resolutions" && request.body._tag === "Uint8Array") {
        const decoded = decodeResolutionRequestBody(request.body.body);
        if (Result.isFailure(decoded)) return yield* Effect.die(decoded.failure.detail);
        const body = decoded.success;
        const names = body.items.map((item) => item.identity.name);
        requests.push({ method: request.method, path, purpose: body.purpose, names });
        if (body.purpose === "select") {
          if (options.dropSelection?.(names) === true)
            return yield* new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new Error("Connection reset by peer"),
                description: "The connection was reset before a response arrived.",
              }),
            });
          return HttpClientResponse.fromWeb(
            request,
            json({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: body.items.map(({ key, identity }) => {
                const versions = byName(identity.name);
                return versions.length === 0
                  ? { key, outcome: "unavailable" }
                  : {
                      key,
                      outcome: "metadata",
                      page: {
                        publisherBindingId: "hbnd_http",
                        visibility: "public",
                        archival: null,
                        deprecation: null,
                        revision: "verification-fixture",
                        observedAt,
                        validUntil: "2026-11-14T10:01:00Z",
                        continuation: null,
                        versions: versions.map((release) => ({
                          version: release.version,
                          published: observedAt,
                          integrity: sri(release.archive),
                        })),
                      },
                    };
              }),
            }),
          );
        }
        return HttpClientResponse.fromWeb(
          request,
          json({
            schemaVersion: 2,
            purpose: "authorize-exact",
            observedAt,
            results: body.items.map((item) => {
              const replaced = options.admission?.(item.identity.name);
              return replaced === undefined
                ? {
                    key: item.key,
                    outcome: "allowed",
                    identity: item.identity,
                    publisherBindingId: item.expectedPublisherBinding,
                    accepted: item.accepted,
                    yanked: false,
                    observedAt,
                  }
                : { key: item.key, ...replaced };
            }),
          }),
        );
      }
      const archive = /^\/v1\/extensions\/%40acme\/skills\/([^/]+)\/([^/]+)\/archive$/.exec(path);
      const name = archive?.[1];
      const usagePurpose = request.headers["x-agentxm-usage-purpose"];
      requests.push({
        method: request.method,
        path,
        names: name === undefined ? [] : [decodeURIComponent(name)],
        ...(usagePurpose === undefined ? {} : { usagePurpose }),
      });
      const release = options.releases.find(
        (candidate) =>
          name !== undefined &&
          candidate.name === decodeURIComponent(name) &&
          candidate.version === decodeURIComponent(archive?.[2] ?? ""),
      );
      if (release === undefined) return yield* Effect.die(`Unexpected Registry request ${path}`);
      const problem = options.archiveProblem?.(release.name);
      if (problem !== undefined)
        return HttpClientResponse.fromWeb(request, json({ status: 403, ...problem }, 403));
      return HttpClientResponse.fromWeb(
        request,
        new Response(new Uint8Array(release.served ?? release.archive), { status: 200 }),
      );
    }),
  );
  const environment = ConfigProvider.layer(ConfigProvider.fromUnknown({ AXM_USER_HOME: home }));
  const services = Layer.mergeAll(
    RegistryContextTest(testRegistryUrl),
    Layer.provide(
      RegistryClientFactoryTest(Layer.succeed(HttpClient.HttpClient, httpClient)),
      Layer.merge(NativePlatformTest, environment),
    ),
    NativePlatformTest,
  );
  const walk = (directory: string): ReadonlyArray<string> =>
    fs.existsSync(directory)
      ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const absolute = nodePath.join(directory, entry.name);
          return entry.isDirectory() ? walk(absolute) : [absolute];
        })
      : [];
  return {
    home,
    requests,
    /** Requests of one kind: selection and admission exchanges, or archive downloads. */
    exchanges: (kind: "select" | "authorize-exact" | "archive") =>
      requests.filter((request) =>
        kind === "archive" ? request.path.endsWith("/archive") : request.purpose === kind,
      ),
    /** Archive files the user archive cache holds. */
    cachedArchives: () => walk(home).filter((file) => file.endsWith(".zip")),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
};
