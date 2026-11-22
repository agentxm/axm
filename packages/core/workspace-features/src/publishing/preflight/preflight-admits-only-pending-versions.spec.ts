import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeRemotePublishWorld,
  publishDocument,
  registryProblem,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preflight-admits-only-pending-versions",
  title: "The authoritative preflight carries only what the uploads need",
  statement:
    "Publish shall ask the Registry to admit only the selected versions it would upload and the already published versions a publishing pack depends on, shall send no preflight when nothing remains to upload, and, when the Registry does not decide a preflight because of a retryable failure, shall report the pending versions with an exact publish command that retries only them.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  boundaryRationale:
    "Production workspace services execute over native temporary files; a controlled HTTP port stands for the Registry so the preflight request itself is observed.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "cli/publish/existing-versions-skip-before-preparation",
    "docs/architecture/commands/publish.md",
  ],
  supersedes: [],
  assumptions: [
    "A version the Registry already has was settled as a successful skip by its presence alone, so the Registry's admission of the remaining uploads does not depend on it unless a publishing pack reads its visibility.",
  ],
  openQuestions: [],
});

const previewedNames = (request: {
  readonly candidates: ReadonlyArray<{
    readonly target: { readonly name: string };
    readonly participation: string;
  }>;
}) => request.candidates.map((candidate) => [candidate.target.name, candidate.participation]);

describe("The authoritative publish preflight", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("admits only the pending version beside already published ones", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({
        settings: { skills: { review: "workspace", draft: "workspace", docs: "workspace" } },
        published: { "@acme/skills/review": "1.0.0", "@acme/skills/draft": "1.0.0" },
      });
      cleanups.push(world.cleanup);
      for (const name of ["review", "draft", "docs"]) world.write("skill", { name });

      const outcome = yield* world.provide(runPublish(remoteRequest()));

      expect(world.previewRequests.map(previewedNames)).toEqual([[["docs", "publish"]]]);
      const document = publishDocument(outcome);
      expect(document.publicationSet.status).toBe("admitted");
      expect(
        document.publicationSet.items.map((item) => [item.name, item.participation]).sort(),
      ).toEqual([
        ["docs", "publish"],
        ["draft", "verified-existing"],
        ["review", "verified-existing"],
      ]);
      expect(document.counts).toMatchObject({ published: 1 });
      expect(world.uploads).toHaveLength(1);
    }),
  );

  it.effect("keeps an already published member a publishing pack depends on", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({
        settings: {
          skills: { review: "workspace", draft: "workspace" },
          packs: { toolkit: "workspace" },
        },
        published: { "@acme/skills/review": "1.0.0", "@acme/skills/draft": "1.0.0" },
      });
      cleanups.push(world.cleanup);
      for (const name of ["review", "draft"]) world.write("skill", { name });
      world.write("pack", { name: "toolkit", dependencies: { "@acme/skills/review": "^1.0.0" } });

      yield* world.provide(runPublish(remoteRequest()));

      expect(world.previewRequests.map((request) => previewedNames(request).sort())).toEqual([
        [
          ["review", "verified-existing"],
          ["toolkit", "publish"],
        ],
      ]);
    }),
  );

  it.effect("sends no preflight when every selected version is already published", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({
        settings: { skills: { review: "workspace" } },
        published: { "@acme/skills/review": "1.0.0" },
      });
      cleanups.push(world.cleanup);
      world.write("skill", { name: "review" });

      const outcome = yield* world.provide(runPublish(remoteRequest()));

      expect(world.previewCount()).toBe(0);
      expect(outcome.disposition._tag).toBe("Completed");
      expect(publishDocument(outcome).publicationSet.status).toBe("admitted");
    }),
  );

  it.live("names the pending versions to retry when the Registry cannot decide the preflight", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({
        settings: { skills: { review: "workspace", docs: "workspace" } },
        published: { "@acme/skills/review": "1.0.0" },
        preview: () => Effect.succeed(registryProblem("service_unavailable", 503)),
      });
      cleanups.push(world.cleanup);
      for (const name of ["review", "docs"]) world.write("skill", { name });

      const outcome = yield* world.provide(runPublish(remoteRequest()));

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.uploads).toEqual([]);
      expect(outcome.recovery).toEqual({
        description: "Retry publish for the versions the preflight left pending",
        remainingItems: ["@acme/skills/docs"],
        blockedDependents: [],
      });
      expect(outcome.results.map((result) => [result.id, result.status]).sort()).toEqual([
        ["@acme/skills/docs", "blocked"],
        ["@acme/skills/review", "success"],
      ]);
    }),
  );
});
