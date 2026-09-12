import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { CliReleaseCatalog, selectUpgradeRelease } from "../../application/index.js";
import { makeCliReleaseCatalog } from "./index.js";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";

const catalog = makeCliReleaseCatalog(
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          description: "Discovery must not run for exact requests",
        }),
      }),
    ),
  ),
);
const resolve = (requestedVersion: string) =>
  selectUpgradeRelease({
    requestedVersion,
    localVersion: "1.0.0",
    binaryName: "axm-linux-x64",
  }).pipe(Effect.provideService(CliReleaseCatalog, catalog));

export const specification = defineSpecification({
  requirement: "cli/upgrade/exact-version-bypasses-discovery",
  title: "Exact upgrade bypasses release discovery",
  statement:
    "An upgrade naming a normalized stable semantic version shall derive its immutable GitHub Release coordinate without discovery, and shall reject leading-v, prerelease, or non-normalized versions before mutation.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Exact upgrade selection", () => {
  it.effect("derives the immutable coordinate without a channel document", () =>
    Effect.gen(function* () {
      const result = yield* resolve("1.2.3");
      expect(result.channel).toBeNull();
      expect(result.release).toEqual({
        tagName: "cli-v1.2.3",
        binaryAssetUrl: "https://github.com/agentxm/axm/releases/download/cli-v1.2.3/axm-linux-x64",
        checksumAssetUrl: "https://github.com/agentxm/axm/releases/download/cli-v1.2.3/SHA256SUMS",
      });
    }),
  );

  it.effect.each(["v1.2.3", "1.2.3-beta.1", "01.2.3"])("rejects %s", (version) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolve(version));
      expect(error.category).toBe("validation");
    }),
  );
});
