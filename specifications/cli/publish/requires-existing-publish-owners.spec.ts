import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { getAppError } from "axm.sh/specification-harness";
import { makeRemotePublicationContext } from "../../support/remote-publication-harness.js";
import {
  jsonRegistryResponse,
  registryProblem,
} from "../../support/registry-management-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

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
    "packages/cli/src/root/publish/command.internal.test.ts",
    "packages/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication owner validation", () => {
  it.live(
    "names a missing owner and its creation route before requesting publication authorization",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makeRemotePublicationContext({
            workspace: {
              machine: false,
              settings: { skills: { review: "workspace", deploy: "workspace" } },
            },
            ownerResponse: (owner) =>
              owner === "@acme"
                ? registryProblem("not_found", 404)
                : jsonRegistryResponse({ displayName: "Acme" }),
          });
          for (const name of ["review", "deploy"])
            writeAuthoredSkill(context.workspace.root, { name });
          const error = getAppError(yield* context.run().pipe(Effect.flip));
          expect(error.code).toBe("not_found");
          expect(error.detail).toContain("@acme");
          expect(error.suggestions).toEqual([
            {
              description: "Create the organization in AgentXM before publishing.",
              url: "https://agentxm.ai/orgs/new",
            },
          ]);
          expect(context.requests.map((request) => new URL(request.url).pathname).sort()).toEqual([
            "/v1/owners/@acme",
          ]);
          expect(context.uploads).toEqual([]);
          expect(context.authorizationCount()).toBe(0);
        }),
      ),
  );
});
