import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  DEFAULT_GITHUB_REPO,
  resolveLatestVersion,
  type VersionRelation,
} from "./version-resolution.js";

interface ReleaseInput {
  readonly tag_name: string;
  readonly draft?: boolean;
  readonly prerelease?: boolean;
  readonly assets?: ReadonlyArray<{
    readonly name: string;
    readonly browser_download_url?: string;
  }>;
}

const release = (version: string, options: Omit<ReleaseInput, "tag_name"> = {}): ReleaseInput => ({
  tag_name: `cli-v${version}`,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: "axm-linux-x64",
      browser_download_url: `https://example.test/cli-v${version}/axm-linux-x64`,
    },
    {
      name: "SHA256SUMS",
      browser_download_url: `https://example.test/cli-v${version}/SHA256SUMS`,
    },
  ],
  ...options,
});

const makeMockHttpClient = (handler: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
  );

const makeNetworkErrorClient = (): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

const resolve = (releases: ReadonlyArray<ReleaseInput>, localVersion: string | null = "0.2.0") =>
  resolveLatestVersion(
    makeMockHttpClient(() => new Response(JSON.stringify(releases), { status: 200 })),
    localVersion,
    DEFAULT_GITHUB_REPO,
    "axm-linux-x64",
  );

describe("resolveLatestVersion", () => {
  it.effect("selects the highest eligible stable CLI release regardless of API order", () =>
    Effect.gen(function* () {
      const result = yield* resolve([
        release("0.3.0"),
        { tag_name: "core-v9.0.0" },
        release("2.0.0"),
        release("1.10.0"),
      ]);

      expect(result.targetVersion).toBe("2.0.0");
      expect(result.release.tagName).toBe("cli-v2.0.0");
      expect(result.release.binaryAssetUrl).toContain("axm-linux-x64");
      expect(result.release.checksumAssetUrl).toContain("SHA256SUMS");
    }),
  );

  it.effect("follows GitHub pagination", () =>
    Effect.gen(function* () {
      const visited: Array<string> = [];
      const client = makeMockHttpClient((url) => {
        visited.push(url);
        if (url.includes("page=2")) {
          return new Response(JSON.stringify([release("3.0.0")]), { status: 200 });
        }
        return new Response(JSON.stringify([release("1.0.0")]), {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/agentxm/axm/releases?per_page=100&page=2>; rel="next"',
          },
        });
      });

      const result = yield* resolveLatestVersion(
        client,
        "1.0.0",
        DEFAULT_GITHUB_REPO,
        "axm-linux-x64",
      );

      expect(result.targetVersion).toBe("3.0.0");
      expect(visited).toHaveLength(2);
    }),
  );

  it.effect(
    "ignores malformed, unrelated, draft, GitHub prerelease, and semver prerelease tags",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve([
          { tag_name: "not-cli-v9.0.0" },
          release("garbage"),
          release("9.0.0", { draft: true }),
          release("8.0.0", { prerelease: true }),
          release("7.0.0-beta.1"),
          release("6.0.0"),
        ]);

        expect(result.targetVersion).toBe("6.0.0");
      }),
  );

  it.effect("fails validation when CLI tags exist but none has valid stable semver", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolve([{ tag_name: "cli-vgarbage" }, release("1.0.0-beta.1")]),
      );
      expect(error.code).toBe("validation");
    }),
  );

  it.effect("fails not_found when no CLI-tagged release exists", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolve([{ tag_name: "core-v1.0.0" }, { tag_name: "web-v2.0.0" }]),
      );
      expect(error.code).toBe("not_found");
    }),
  );

  it.effect("fails unavailable instead of falling back when the highest target lacks assets", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolve([
          release("2.0.0", {
            assets: [{ name: "axm-linux-x64", browser_download_url: "https://example.test/bin" }],
          }),
          release("1.0.0"),
        ]),
      );
      expect(error.code).toBe("unavailable");
    }),
  );

  it.effect("classifies every local version relation without a string sentinel", () =>
    Effect.gen(function* () {
      const cases: ReadonlyArray<readonly [string | null, VersionRelation]> = [
        ["0.9.0", "upgrade-available"],
        ["1.0.0", "current"],
        ["2.0.0", "local-newer"],
        [null, "unknown-local"],
      ];

      for (const [localVersion, expected] of cases) {
        const result = yield* resolve([release("1.0.0")], localVersion);
        expect(result.localVersion).toBe(localVersion);
        expect(result.versionRelation).toBe(expected);
      }
    }),
  );

  it.effect("uses semver precedence for build metadata", () =>
    Effect.gen(function* () {
      const result = yield* resolve([release("1.0.0+build.2"), release("1.0.0+build.1")], "1.0.0");
      expect(result.versionRelation).toBe("current");
    }),
  );

  it.effect("uses a custom repository in API URLs", () =>
    Effect.gen(function* () {
      const client = makeMockHttpClient((url) => {
        expect(url).toContain("my-org/my-cli");
        return new Response(JSON.stringify([release("1.0.0")]), { status: 200 });
      });
      yield* resolveLatestVersion(client, "0.1.0", "my-org/my-cli", "axm-linux-x64");
    }),
  );

  it.effect("maps rate limits, upstream failures, and transport failures", () =>
    Effect.gen(function* () {
      const rateLimited = makeMockHttpClient(() => new Response("rate limited", { status: 403 }));
      const unavailable = makeMockHttpClient(
        () => new Response("upstream failure", { status: 503 }),
      );

      expect((yield* Effect.flip(resolveLatestVersion(rateLimited, "1.0.0"))).code).toBe(
        "rate_limit",
      );
      expect((yield* Effect.flip(resolveLatestVersion(unavailable, "1.0.0"))).code).toBe(
        "unavailable",
      );
      expect(
        (yield* Effect.flip(resolveLatestVersion(makeNetworkErrorClient(), "1.0.0"))).code,
      ).toBe("network");
    }),
  );
});
