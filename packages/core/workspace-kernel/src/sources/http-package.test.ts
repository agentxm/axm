import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import { ArtifactHttpClient } from "./http-download.js";
import { acquireHttpOffer } from "./http-package.js";

it.effect("counts implicit legacy inventory directories before downloading files", () =>
  Effect.gen(function* () {
    const client = HttpClient.make(() => Effect.die("Over-budget inventory reached transport"));
    const failure = yield* acquireHttpOffer(
      {
        name: "review",
        format: "files",
        artifacts: ["SKILL.md", "one/two/file.txt"].map((path) => ({
          path,
          url: new URL(`https://example.test/${path}`),
        })),
      },
      { maxEntries: 3 },
    ).pipe(Effect.provideService(ArtifactHttpClient, client), Effect.flip);
    expect(failure.detail).toContain("implicit directories");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
