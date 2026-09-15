import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  AuthLoginPresenterTest,
  CredentialStoreTest,
} from "@agentxm/registry-auth/testing";

import { unyank } from "../lifecycle/retirement.js";
import {
  expectPublishFailed,
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/unyank/requires-an-exact-version",
  title: "Unyank restores only the explicitly identified version",
  statement:
    "The unyank command shall require an exact semantic version, request restoration only for that version, and report restoration only after the Registry acknowledges the request.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/lifecycle/command.ts",
    "apps/cli/src/root/lifecycle/command.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registryVersion = `${registryTarget}@1.2.3`;

/** No terminal and no pending request: the write needs no step-up here. */
const verification = { unattended: true } as const;

/** The authorization ports every Registry write passes through. */
const withAuthPorts = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        AuthClientTest(),
        AuthLoginInteractionTest().layer,
        AuthLoginPresenterTest().layer,
        CredentialStoreTest(),
      ),
    ),
  );

/** The version record the Registry returns once the yank is lifted. */
const restoredVersionResponse = () =>
  jsonRegistryResponse({
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.2.3",
    yankedAt: null,
    yankCategory: null,
    yankNotice: null,
    links: { html: "https://agentxm.ai/@acme/skills/review/1.2.3" },
  });

describe("Exact restoration", () => {
  it.effect("sends a single version-specific deletion and reports that version", () =>
    Effect.gen(function* () {
      const world = makeRegistryManagementWorld(() => restoredVersionResponse());

      const transition = yield* world.provide(withAuthPorts(unyank(registryVersion, verification)));

      expect(world.requests).toHaveLength(1);
      expect(world.requests[0]?.method).toBe("DELETE");
      expect(world.requests[0]?.url.pathname).toBe(`${registryTargetPath}/1.2.3/yank`);
      expect(transition).toMatchObject({
        action: "unyank",
        target: registryVersion,
        version: "1.2.3",
        disposition: "changed",
        restorable: false,
      });
    }),
  );

  for (const ref of [registryTarget, `${registryTarget}@^1.2.3`, `${registryTarget}@*`]) {
    it.effect(`rejects non-exact restoration ${ref}`, () =>
      Effect.gen(function* () {
        const world = makeRegistryManagementWorld(() => {
          throw new Error("Invalid selection must not contact the Registry");
        });

        const failure = yield* world.provide(withAuthPorts(Effect.flip(unyank(ref, verification))));

        expect(expectPublishFailed(failure).category).toBe("validation");
        expect(world.requests).toEqual([]);
      }),
    );
  }
});
