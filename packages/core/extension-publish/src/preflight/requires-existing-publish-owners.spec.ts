import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  expectPublishFailed,
  jsonRegistryResponse,
  makeRemotePublishWorld,
  registryProblem,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/requires-existing-publish-owners",
  title: "Publication requires an existing owner",
  statement:
    "Before remotely publishing a selected extension, AXM shall require its owner to exist and, when an owner is absent, reject publication without uploading and provide the organization creation route.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.test.ts",
    "apps/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication owner validation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "names a missing owner and its creation route before requesting publication authorization",
    () =>
      Effect.gen(function* () {
        const world = makeRemotePublishWorld({
          settings: { skills: { review: "workspace", deploy: "workspace" } },
          ownerResponse: (owner) =>
            owner === "@acme"
              ? registryProblem("not_found", 404)
              : jsonRegistryResponse({ displayName: "Acme" }),
        });
        cleanups.push(world.cleanup);
        for (const name of ["review", "deploy"]) world.write("skill", { name });

        const failure = expectPublishFailed(
          yield* world.provide(runPublish(remoteRequest())).pipe(Effect.flip),
        );

        expect(failure.category).toBe("not_found");
        expect(failure.detail).toContain("@acme");
        expect(failure.suggestions).toEqual([
          {
            description: "Create the organization in AgentXM before publishing.",
            url: "https://agentxm.ai/orgs/new",
          },
        ]);
        expect(world.requests.map((request) => new URL(request.url).pathname).sort()).toEqual([
          "/v1/owners/%40acme",
        ]);
        expect(world.uploads).toEqual([]);
        expect(world.authorizationCount()).toBe(0);
      }),
  );
});
