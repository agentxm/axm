import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { resolveLatestVersion } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { stableChannelDocument } from "../../support/release-channel-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/latest-uses-promoted-stable-channel",
  title: "Latest upgrade uses the promoted stable channel",
  statement:
    "An upgrade without an exact version shall select only the validated release coordinate in the fixed public stable-channel document using one bounded request, and shall not enumerate GitHub releases or infer stability from package-manager publication state.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Latest upgrade selection", () => {
  it.effect("selects the promoted coordinate in exactly one channel request", () =>
    Effect.gen(function* () {
      const requests: Array<string> = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(stableChannelDocument()), {
              status: 200,
              headers: { etag: '"revision-3"' },
            }),
          );
        }),
      );

      const result = yield* resolveLatestVersion(client, "1.0.0", "axm-linux-x64");
      expect(requests).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
      expect(result).toMatchObject({
        targetVersion: "2.0.0",
        etag: '"revision-3"',
        channel: { revision: 3 },
        release: { tagName: "cli-v2.0.0" },
      });
    }),
  );
});
