/**
 * @agentxm/registry-client deterministic test ports.
 *
 * Three seams, none of which reaches the network: the Registry endpoint one
 * run targets, an HTTP transport that either records every request and
 * answers from a fixture or refuses outright, and a `file://` Registry whose
 * on-disk layout is the real one — a per-extension `index.json` beside
 * version archives carrying genuine `sha512` integrity. A test that passes
 * over `OfflineHttpClient` is simultaneously evidence that the exercised
 * path never opened a socket. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import { strToU8, zipSync } from "fflate";

import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { RegistryClientFactory, makeRegistryClientFactory } from "./registry-client-factory.js";
import { RegistryUrl } from "./registry-url.js";

/** The endpoint fixtures name when the test does not care which Registry it is. */
export const testRegistryUrl = "https://registry.example.test";

/** The Registry endpoint one run targets. */
export const RegistryUrlTest = (url: string = testRegistryUrl): Layer.Layer<RegistryUrl> =>
  Layer.succeed(RegistryUrl, url);

/** One request the recorded transport observed, in the shape a test asserts on. */
export interface ObservedRegistryRequest {
  readonly method: string;
  readonly url: string;
  /** Decoded JSON body, or `undefined` when the request carried none. */
  readonly body: unknown;
  readonly hasAuthorization: boolean;
}

/** The answer a recorded transport returns for one observed request. */
export interface RegistryResponseFixture {
  readonly status?: number;
  readonly body: unknown;
}

export interface RecordedRegistryTransport {
  /** Every request the run issued, in order. */
  readonly requests: ReadonlyArray<ObservedRegistryRequest>;
  readonly httpClient: HttpClient.HttpClient;
  /** The transport, ready to provide. */
  readonly layer: Layer.Layer<HttpClient.HttpClient>;
  /** A `RegistryClientFactory` over this transport. */
  readonly factory: Layer.Layer<
    RegistryClientFactory,
    never,
    FileSystem.FileSystem | Path.Path | RegistryUrl
  >;
  /** Resolves as soon as the run issues its first request. */
  readonly firstRequest: Effect.Effect<void>;
}

/**
 * An HTTP transport that records every Registry request and answers it from
 * `respond`. Nothing leaves the process, so the recorded list is the complete
 * account of what the run asked the Registry for — including the fact that a
 * refusal happened before any request at all.
 */
export const makeRecordedRegistryTransport = (
  respond: (request: ObservedRegistryRequest) => RegistryResponseFixture,
): RecordedRegistryTransport => {
  const requests: Array<ObservedRegistryRequest> = [];
  const firstRequest = Deferred.makeUnsafe<void>();
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      const observed: ObservedRegistryRequest = {
        method: request.method,
        url: request.url,
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
        hasAuthorization: request.headers["authorization"] !== undefined,
      };
      requests.push(observed);
      yield* Deferred.succeed(firstRequest, undefined);
      const fixture = respond(observed);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(fixture.body), {
          status: fixture.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  const layer = Layer.succeed(HttpClient.HttpClient, httpClient);
  const factory = Layer.effect(
    RegistryClientFactory,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const defaultRegistryLocation = yield* RegistryUrl;
      return makeRegistryClientFactory({
        httpClient,
        fileSystem,
        path,
        defaultRegistryLocation,
      });
    }),
  );
  return { requests, httpClient, layer, factory, firstRequest: Deferred.await(firstRequest) };
};

/**
 * A transport that refuses every request with a typed transport error. Compose
 * it when the run under test must not reach the network at all: a passing
 * assertion then carries that claim rather than asserting it separately.
 */
export const OfflineHttpClient: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("The offline test transport refuses every request."),
          description: "Offline test transport",
        }),
      }),
    ),
  ),
);

/** One published version of a skill, with a body that makes versions observably distinct. */
export interface RegistrySkillVersion {
  readonly version: string;
  readonly body: string;
  /** Publication instant; defaults to one older than any minimum release age. */
  readonly published?: string;
}

/** One published version of an MCP server package. */
export interface RegistryMcpVersion {
  readonly version: string;
  readonly files?: Readonly<Record<string, string>>;
  /** A required secret environment input, for credential-lifecycle fixtures. */
  readonly secretInput?: string;
  readonly published?: string;
}

/** One published version of a pack, with the member constraints it declares. */
export interface RegistryPackVersion {
  readonly version: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly published?: string;
}

/** One published version of an Open Knowledge Format bundle. */
export interface RegistryKnowledgeVersion {
  readonly version: string;
  readonly body: string;
  readonly published?: string;
}

export interface FileRegistry {
  /** Absolute Registry root directory. */
  readonly root: string;
  /** `file://` URL, usable as a settings source location or `--registry-url`. */
  readonly url: string;
  /** The settings `sources` entry that names this Registry. */
  readonly source: {
    readonly name: string;
    readonly type: "registry";
    readonly location: string;
  };
  /**
   * Publishes the complete version list for one skill, replacing any previous
   * index. Call again with more versions to model a later publication.
   */
  readonly writeSkill: (name: string, versions: ReadonlyArray<RegistrySkillVersion>) => void;
  readonly writeMcp: (name: string, versions: ReadonlyArray<RegistryMcpVersion>) => void;
  readonly writePack: (name: string, versions: ReadonlyArray<RegistryPackVersion>) => void;
  readonly writeKnowledge: (
    name: string,
    versions: ReadonlyArray<RegistryKnowledgeVersion>,
  ) => void;
  /** Every file the Registry holds, relative to its root, sorted. */
  readonly storedFiles: () => ReadonlyArray<string>;
  readonly cleanup: () => void;
}

/**
 * Publication instant every fixture version carries by default. It predates
 * the deterministic test clock by decades, so a written version is eligible
 * for selection under any configured minimum release age; pass a recent
 * `published` to model a release the age policy still withholds.
 */
export const FIXTURE_PUBLISHED_AT = "1960-01-01T00:00:00Z";

/** The owner handle every fixture extension is published under. */
export const FIXTURE_OWNER = "@acme";

// ZIP stores a local-time DOS timestamp and admits only 1980-2099. Building
// the fixed instant from local components keeps the encoded fields identical
// in every timezone; an instant fixed in UTC falls into 1979 west of
// Greenwich, which the format cannot represent.
// eslint-disable-next-line no-restricted-syntax -- ZIP's driver API requires Date; this fixed value never reads the ambient clock.
const ARCHIVE_MTIME = new Date(1980, 0, 2, 0, 0, 0, 0);

const versionParts = (version: string): ReadonlyArray<number> =>
  (version.split("-")[0] ?? version).split(".").map((part) => Number.parseInt(part, 10));

/**
 * A Registry index lists versions newest-first and the resolvers rely on that
 * order; callers may pass versions in any order.
 */
const newestFirst = <T extends { readonly version: string }>(
  entries: ReadonlyArray<T>,
): ReadonlyArray<T> =>
  [...entries].sort((left, right) => {
    const a = versionParts(left.version);
    const b = versionParts(right.version);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const difference = (b[index] ?? 0) - (a[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });

const walkFiles = (root: string, directory: string): ReadonlyArray<string> =>
  fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = nodePath.join(directory, entry.name);
        return entry.isDirectory()
          ? walkFiles(root, absolute)
          : [nodePath.relative(root, absolute).split(nodePath.sep).join("/")];
      })
    : [];

/**
 * A Registry on disk, served over `file://`.
 *
 * The layout is the product's own — `extensions/<owner>/<type>/<name>/index.json`
 * beside `<version>.zip` archives whose recorded integrity is computed from
 * the bytes actually written — so the real resolution path reads it without a
 * double. Pass `root` to place it inside a workspace a test already owns;
 * otherwise it lands in a temporary directory `cleanup` removes.
 */
export const makeFileRegistry = (options: { readonly root?: string } = {}): FileRegistry => {
  const root =
    options.root ?? fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-registry-")));
  fs.mkdirSync(root, { recursive: true });

  const writeArchive = (
    directory: string,
    version: string,
    entries: Readonly<Record<string, string>>,
  ): Uint8Array => {
    fs.mkdirSync(directory, { recursive: true });
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([relative, content]) => [relative, strToU8(content)]),
      ),
      { mtime: ARCHIVE_MTIME },
    );
    fs.writeFileSync(nodePath.join(directory, `${version}.zip`), archive);
    return archive;
  };

  const integrityOf = (archive: Uint8Array): string =>
    `sha512-${createHash("sha512").update(archive).digest("base64")}`;

  const writeIndex = (
    directory: string,
    type: string,
    name: string,
    versions: ReadonlyArray<Readonly<Record<string, unknown>> & { readonly version: string }>,
  ): void => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      nodePath.join(directory, "index.json"),
      `${JSON.stringify(
        {
          owner: FIXTURE_OWNER,
          type,
          name,
          publisherBindingId: "hbnd_test",
          deprecation: null,
          versions: newestFirst(versions),
        },
        null,
        2,
      )}\n`,
    );
  };

  const extensionDir = (segment: string, name: string): string =>
    nodePath.join(root, "extensions", FIXTURE_OWNER, segment, name);

  const writeSkill = (name: string, versions: ReadonlyArray<RegistrySkillVersion>): void => {
    const directory = extensionDir("skills", name);
    writeIndex(
      directory,
      "skill",
      name,
      versions.map(({ version, body, published }) => ({
        version,
        published: published ?? FIXTURE_PUBLISHED_AT,
        integrity: integrityOf(
          writeArchive(directory, version, {
            "skill.json": `${JSON.stringify(
              {
                owner: FIXTURE_OWNER,
                type: "skill",
                name,
                version,
                description: `The ${name} skill.`,
              },
              null,
              2,
            )}\n`,
            "src/SKILL.md": `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
          }),
        ),
      })),
    );
  };

  const writeMcp = (name: string, versions: ReadonlyArray<RegistryMcpVersion>): void => {
    const directory = extensionDir("mcps", name);
    writeIndex(
      directory,
      "mcp-server",
      name,
      versions.map(({ version, secretInput, files: packageFiles, published }) => ({
        version,
        published: published ?? FIXTURE_PUBLISHED_AT,
        integrity: integrityOf(
          writeArchive(directory, version, {
            "mcp.json": `${JSON.stringify(
              {
                owner: FIXTURE_OWNER,
                type: "mcp-server",
                name,
                version,
                server: {
                  name: `ai.agentxm.spec/${name}`,
                  description: `The ${name} MCP server.`,
                  version,
                  packages: [
                    {
                      registryType: "npm",
                      identifier: `${FIXTURE_OWNER}/${name}`,
                      version,
                      transport: { type: "stdio" },
                      ...(secretInput === undefined
                        ? {}
                        : {
                            environmentVariables: [
                              { name: secretInput, isRequired: true, isSecret: true },
                            ],
                          }),
                    },
                  ],
                },
              },
              null,
              2,
            )}\n`,
            ...packageFiles,
          }),
        ),
      })),
    );
  };

  const writePack = (name: string, versions: ReadonlyArray<RegistryPackVersion>): void => {
    const directory = extensionDir("packs", name);
    writeIndex(
      directory,
      "pack",
      name,
      versions.map(({ version, dependencies, files: packageFiles, published }) => ({
        version,
        published: published ?? FIXTURE_PUBLISHED_AT,
        // The index carries the member constraints the resolver reads; the
        // archive manifest must agree with it, or the accepted identity will
        // not match the realized package.
        dependencies,
        integrity: integrityOf(
          writeArchive(directory, version, {
            "pack.json": `${JSON.stringify(
              {
                owner: FIXTURE_OWNER,
                type: "pack",
                name,
                version,
                description: `The ${name} pack.`,
                dependencies,
              },
              null,
              2,
            )}\n`,
            ...packageFiles,
          }),
        ),
      })),
    );
  };

  const writeKnowledge = (
    name: string,
    versions: ReadonlyArray<RegistryKnowledgeVersion>,
  ): void => {
    const directory = extensionDir("knowledge", name);
    writeIndex(
      directory,
      "knowledge",
      name,
      versions.map(({ version, body, published }) => ({
        version,
        published: published ?? FIXTURE_PUBLISHED_AT,
        integrity: integrityOf(
          writeArchive(directory, version, {
            "knowledge.json": `${JSON.stringify(
              {
                owner: FIXTURE_OWNER,
                type: "knowledge",
                name,
                version,
                description: `The ${name} knowledge bundle.`,
                format: { name: "okf", version: "0.2" },
                bundleRoot: "src",
              },
              null,
              2,
            )}\n`,
            "src/index.md": `---\nokf_version: "0.2"\ndescription: "The ${name} knowledge bundle."\n---\n\n# ${name}\n\n${body}\n`,
          }),
        ),
      })),
    );
  };

  return {
    root,
    url: pathToFileURL(root).href,
    source: { name: "agentxm", type: "registry", location: `file://${root}` },
    writeSkill,
    writeMcp,
    writePack,
    writeKnowledge,
    storedFiles: () => [...walkFiles(root, root)].sort(),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};
