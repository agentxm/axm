import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { CliReleaseCatalog, selectUpgradeRelease } from "../../application/index.js";
import { makeCliReleaseCatalog } from "./index.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/latest-uses-github-release",
  title: "Latest upgrade uses GitHub's latest release",
  statement:
    "An upgrade without an exact version shall resolve the stable release from the Location header of one bounded request to the repository's GitHub latest-release URL, validate its release tag, derive immutable asset URLs from that tag, and shall not use the GitHub REST API or package-manager publication state for release selection.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: ["cli/upgrade/latest-uses-promoted-stable-channel"],
  assumptions: [
    "The release workflow publishes a stable CLI release as GitHub's latest release after all immutable artifacts are attached.",
  ],
  openQuestions: [],
});

describe("Latest upgrade selection", () => {
  it.effect("selects the validated coordinate in exactly one GitHub request", () =>
    Effect.gen(function* () {
      const requests: Array<string> = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(null, {
              status: 302,
              headers: {
                location: "https://github.com/agentxm/axm/releases/tag/cli-v2.0.0",
              },
            }),
          );
        }),
      );

      const result = yield* selectUpgradeRelease({
        localVersion: "1.0.0",
        binaryName: "axm-linux-x64",
      }).pipe(Effect.provideService(CliReleaseCatalog, makeCliReleaseCatalog(client)));
      expect(requests).toEqual(["https://github.com/agentxm/axm/releases/latest"]);
      expect(result).toMatchObject({
        targetVersion: "2.0.0",
        source: "github-latest",
        release: {
          tagName: "cli-v2.0.0",
          binaryAssetUrl:
            "https://github.com/agentxm/axm/releases/download/cli-v2.0.0/axm-linux-x64",
        },
      });
    }),
  );
});
