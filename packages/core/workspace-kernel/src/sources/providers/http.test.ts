import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  MAX_ACQUIRED_TREE_BYTES,
  OperationScratchBudget,
  makeOperationScratchBudget,
} from "@agentxm/registry-client";
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
