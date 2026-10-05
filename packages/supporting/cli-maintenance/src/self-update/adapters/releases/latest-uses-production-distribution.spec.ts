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
    "An upgrade without an exact version shall resolve and validate the stable version from one bounded request to the production release origin, derive immutable binary and checksum URLs from that version, and require no GitHub availability or package-manager publication state for release selection.",
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
