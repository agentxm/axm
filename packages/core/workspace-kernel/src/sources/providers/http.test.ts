import {
  MAX_ACQUIRED_TREE_BYTES,
  OperationScratchBudget,
  makeOperationScratchBudget,
} from "../../acquisition/index.js";
import { zipSync } from "fflate";
import { gzipSync } from "node:zlib";
import { pack } from "tar-stream";
import * as Stream from "effect/Stream";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { ArtifactHttpClient, httpArtifactDigest } from "../http-download.js";
import { WELL_KNOWN_SCHEMA } from "../well-known-index.js";
import { createHttpSourceHostProvider } from "./http.js";

const options = {
  type: "skill",
  names: [],
  owner: Option.none(),
  versionRange: Option.none(),
} as const;

describe("HTTP discovery scratch admission", () => {
  it.effect("refuses an artifact before download when the operation cannot reserve a tree", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationScratchBudget(MAX_ACQUIRED_TREE_BYTES - 1);
      const client = HttpClient.make(() => Effect.die("Unadmitted artifact reached transport"));
      const failure = yield* createHttpSourceHostProvider()
        .find(
          {
            type: "http",
            kind: "skill-md",
            url: new URL("https://example.test/review/SKILL.md"),
          },
          options,
        )
        .pipe(
          Effect.provideService(ArtifactHttpClient, client),
          Effect.provideService(OperationScratchBudget, budget),
          Effect.flip,
        );
      expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      expect(failure.detail).toContain("scratch limit");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("retains each offer's reservation until discovery scope closes", () =>
    Effect.gen(function* () {
      const bytes = new TextEncoder().encode("# Review\n");
      const index = JSON.stringify({
        $schema: WELL_KNOWN_SCHEMA,
        skills: ["one", "two"].map((name) => ({
          name,
          type: "skill-md",
          url: `${name}/SKILL.md`,
          digest: httpArtifactDigest(bytes),
        })),
      });
      const requests: string[] = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(request.url.endsWith("index.json") ? index : bytes),
          );
        }),
      );
      const budget = yield* makeOperationScratchBudget(MAX_ACQUIRED_TREE_BYTES);
      const provider = createHttpSourceHostProvider();
      const source = {
        type: "http",
        kind: "index",
        url: new URL("https://example.test/index.json"),
      } as const;
      const failure = yield* provider
        .find(source, options)
        .pipe(
          Effect.provideService(ArtifactHttpClient, client),
          Effect.provideService(OperationScratchBudget, budget),
          Effect.scoped,
          Effect.flip,
        );
      expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      expect(requests).toEqual([
        "https://example.test/index.json",
        "https://example.test/one/SKILL.md",
      ]);
      // Closing the failed discovery frees its retained reservation for another operation.
      const selected = yield* provider
        .find({ ...source, entry: "two" }, options)
        .pipe(
          Effect.provideService(ArtifactHttpClient, client),
          Effect.provideService(OperationScratchBudget, budget),
          Effect.scoped,
        );
      expect(selected).toHaveLength(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("HTTP collection bounds and explicit selection", () => {
  it.effect("shares the retained entry limit across archive offers", () =>
    Effect.gen(function* () {
      const payload = zipSync({
        "SKILL.md": new TextEncoder().encode("# Review"),
        ...Object.fromEntries(
          Array.from(
            { length: 5_999 },
            (_, index) => [`asset-${index}`, new Uint8Array()] as const,
          ),
        ),
      });
      const index = JSON.stringify({
        $schema: WELL_KNOWN_SCHEMA,
        skills: ["one", "two"].map((name) => ({
          name,
          type: "archive",
          url: `${name}.zip`,
          digest: httpArtifactDigest(payload),
        })),
      });
      const client = HttpClient.make((request) =>
        Effect.sync(() =>
          HttpClientResponse.fromWeb(
            request,
            new Response(request.url.endsWith("index.json") ? index : payload),
          ),
        ),
      );
      const failure = yield* createHttpSourceHostProvider()
        .find(
          { type: "http", kind: "index", url: new URL("https://example.test/index.json") },
          options,
        )
        .pipe(Effect.provideService(ArtifactHttpClient, client), Effect.result);
      expect(failure).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "SourceNotResolvable", category: "validation" },
      });
      expect(failure).toMatchObject({ failure: { detail: expect.stringMatching(/entry limit/i) } });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect.each(["name", "fragment"] as const)(
    "reports requested remote marketplace activation selected by %s",
    (selection) =>
      Effect.gen(function* () {
        const payload = zipSync({
          ".claude-plugin/marketplace.json": new TextEncoder().encode(
            JSON.stringify({
              name: "catalog",
              plugins: [{ name: "remote", source: { source: "github", repo: "example/plugin" } }],
            }),
          ),
        });
        const client = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(payload))),
        );
        const failure = yield* createHttpSourceHostProvider()
          .find(
            {
              type: "http",
              kind: "archive",
              url: new URL("https://example.test/catalog.zip"),
              ...(selection === "fragment" ? { entry: "remote" } : {}),
            },
            { ...options, names: selection === "name" ? ["remote"] : [] },
          )
          .pipe(Effect.provideService(ArtifactHttpClient, client), Effect.result);
        expect(failure).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "SourceNotResolvable", category: "validation" },
        });
        expect(failure).toMatchObject({
          failure: { detail: expect.stringContaining("unsupported remote source") },
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Manifest packages in direct HTTPS archives", () => {
  it.effect.each(["zip", "tar", "tar.gz"] as const)(
    "discovers and replays Knowledge from %s without a skill entry",
    (format) =>
      Effect.gen(function* () {
        const files = {
          "knowledge/handbook/knowledge.json": JSON.stringify({
            type: "knowledge",
            owner: "@acme",
            name: "handbook",
            version: "1.0.0",
            format: { name: "okf", version: "0.2" },
            bundleRoot: "src",
          }),
          "knowledge/handbook/src/index.md": "---\nokf_version: '0.2'\n---\n# Handbook\n",
          "knowledge/handbook/companion.txt": "Retained package context\n",
        };
        const archive =
          format === "zip"
            ? zipSync(
                Object.fromEntries(
                  Object.entries(files).map(([name, value]) => [
                    name,
                    new TextEncoder().encode(value),
                  ]),
                ),
              )
            : yield* Effect.gen(function* () {
                const tar = yield* Effect.acquireRelease(
                  Effect.sync(() => pack()),
                  (tar) =>
                    Effect.sync(() => {
                      tar.destroy();
                    }),
                );
                for (const [name, body] of Object.entries(files)) tar.entry({ name }, body);
                tar.finalize();
                const chunks: AsyncIterable<unknown> = tar;
                const bytes = yield* Stream.fromAsyncIterable(chunks, (cause) => cause).pipe(
                  Stream.runFoldEffect(
                    (): Uint8Array[] => [],
                    (bytes, chunk) =>
                      Effect.sync(() => {
                        if (!(chunk instanceof Uint8Array))
                          throw new Error("Expected archive bytes");
                        bytes.push(chunk);
                        return bytes;
                      }),
                  ),
                );
                return Buffer.concat(bytes);
              });
        const payload = format === "tar.gz" ? gzipSync(archive) : archive;
        const client = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(payload))),
        );
        const source = {
          type: "http",
          kind: "archive",
          url: new URL(`https://example.test/collection.${format}`),
        } as const;
        const provider = createHttpSourceHostProvider();
        const refs = yield* provider
          .find(source, { ...options, type: "knowledge", names: ["handbook"] })
          .pipe(Effect.provideService(ArtifactHttpClient, client));
        expect(refs).toHaveLength(1);
        const ref = refs[0];
        if (ref === undefined) throw new Error("Expected Knowledge ref");
        expect(ref).toMatchObject({
          type: "knowledge",
          refType: "http",
          sourcePath: "knowledge/handbook",
          owner: "@acme",
          portable: false,
          snapshot: { format, digest: httpArtifactDigest(payload) },
        });
        const acquired = yield* provider
          .fetch(source, ref)
          .pipe(Effect.provideService(ArtifactHttpClient, client));
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        expect(yield* fs.readFileString(path.join(acquired.directory, "companion.txt"))).toBe(
          "Retained package context\n",
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["skill-md", "index"] as const)("keeps %s discovery skill-specific", (kind) =>
    Effect.gen(function* () {
      const client = HttpClient.make(() =>
        Effect.die("Non-skill discovery reached a skill-only source"),
      );
      const refs = yield* createHttpSourceHostProvider()
        .find(
          { type: "http", kind, url: new URL("https://example.test/") },
          { ...options, type: "knowledge" },
        )
        .pipe(Effect.provideService(ArtifactHttpClient, client));
      expect(refs).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

it.effect("intersects archive fragments with requested names", () =>
  Effect.gen(function* () {
    const payload = zipSync({
      "review/SKILL.md": new TextEncoder().encode("---\nname: review\n---\n# Review\n"),
    });
    const client = HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, new Response(payload))),
    );
    const refs = yield* createHttpSourceHostProvider()
      .find(
        {
          type: "http",
          kind: "archive",
          url: new URL("https://example.test/skills.zip"),
          entry: "review",
        },
        { ...options, names: ["another"] },
      )
      .pipe(Effect.provideService(ArtifactHttpClient, client));
    expect(refs).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
