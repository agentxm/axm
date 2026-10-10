import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClientError from "effect/http/HttpClientError";
import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { CliReleaseCatalog, selectUpgradeRelease } from "../../application/index.js";
import { makeCliReleaseCatalog } from "./index.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/latest-uses-production-distribution",
  title: "Latest upgrade uses the production release distribution",
  statement:
    "An upgrade without an exact version shall resolve and validate the stable version from one bounded request to the production release origin, derive immutable binary and checksum URLs from that version, and require no GitHub availability or package-manager publication state for release selection. DNS, connection, and TLS transport failures shall report network, while the bounded release-discovery deadline shall report timeout.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: ["cli/upgrade/latest-uses-github-release"],
  assumptions: [
    "The release workflow updates latest.txt only after verifying the complete immutable release.",
  ],
  openQuestions: [],
});

describe("Latest upgrade selection", () => {
  for (const cause of ["ENOTFOUND", "ECONNREFUSED", "TLS_CERTIFICATE_REJECTED"] as const) {
    it.effect(`${cause} remains a network failure`, () =>
      Effect.gen(function* () {
        const client = HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause: new Error(cause) }),
            }),
          ),
        );
        const failure = yield* Effect.flip(makeCliReleaseCatalog(client).stable("axm-linux-x64"));
        expect(failure.category).toBe("network");
      }),
    );
  }

  it.effect("a hanging release discovery settles as timeout at its bounded deadline", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const client = HttpClient.make(() =>
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      );
      const fiber = yield* Effect.flip(makeCliReleaseCatalog(client).stable("axm-linux-x64")).pipe(
        Effect.forkChild,
      );
      yield* Deferred.await(started);
      yield* TestClock.adjust("10 seconds");
      const failure = yield* Fiber.join(fiber);
      expect(failure.category).toBe("timeout");
    }),
  );

  it.effect("selects the validated coordinate in exactly one distribution request", () =>
    Effect.gen(function* () {
      const requests: Array<string> = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(request, new Response("2.0.0\n"));
        }),
      );

      const result = yield* selectUpgradeRelease({
        localVersion: "1.0.0",
        binaryName: "axm-linux-x64",
      }).pipe(Effect.provideService(CliReleaseCatalog, makeCliReleaseCatalog(client)));
      expect(requests).toEqual(["https://releases.axm.sh/latest.txt"]);
      expect(result).toMatchObject({
        targetVersion: "2.0.0",
        source: "distribution-latest",
        release: {
          tagName: "cli-v2.0.0",
          binaryAssetUrl: "https://releases.axm.sh/cli-v2.0.0/axm-linux-x64",
        },
      });
    }),
  );
});
