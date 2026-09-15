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

import { yank } from "../lifecycle/retirement.js";
import {
  expectPublishFailed,
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/yank/submits-the-requested-version-selection",
  title: "Yank submits the explicit version selection and publisher guidance",
  statement:
    "The yank command shall require an exact version unless all available versions are explicitly selected, submit only that selection with the supplied category and notice, and report the acknowledged selection without claiming that future versions were yanked.",
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

/** The version record the Registry returns once a version is yanked. */
const yankedVersionResponse = () =>
  jsonRegistryResponse({
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.2.3",
    yankedAt: "2026-07-29T00:00:00.000Z",
    yankCategory: "security",
    yankNotice: "Unsafe release.",
    links: { html: "https://agentxm.ai/@acme/skills/review/1.2.3" },
  });

describe("Yank selection", () => {
  it.effect("posts one exact version and its guidance before reporting one committed unit", () =>
    Effect.gen(function* () {
      const world = makeRegistryManagementWorld(() => yankedVersionResponse());

      const transition = yield* world.provide(
        withAuthPorts(
          yank({
            ref: registryVersion,
            allVersions: false,
            category: "security",
            notice: "Unsafe release.",
            verification,
          }),
        ),
      );

      expect(world.requests).toHaveLength(1);
      expect(world.requests[0]).toMatchObject({
        method: "POST",
        body: { category: "security", notice: "Unsafe release." },
      });
      expect(world.requests[0]?.url.pathname).toBe(`${registryTargetPath}/1.2.3/yank`);
      expect(transition).toMatchObject({
        action: "yank",
        target: registryVersion,
        version: "1.2.3",
        disposition: "changed",
        // A Registry write is not restorable; the outcome never claims it is.
        restorable: false,
      });
      expect(transition.message).toContain("Exact installs remain available");
    }),
  );

  it.effect("uses the all-available selection and reports the Registry's acknowledged count", () =>
    Effect.gen(function* () {
      const world = makeRegistryManagementWorld(() =>
        jsonRegistryResponse({
          selection: "all-available",
          affectedVersions: ["1.0.0", "1.2.3"],
          futureVersionsAffected: false,
        }),
      );

      const transition = yield* world.provide(
        withAuthPorts(yank({ ref: registryTarget, allVersions: true, verification })),
      );

      expect(world.requests).toHaveLength(1);
      expect(world.requests[0]?.url.pathname).toBe(`${registryTargetPath}/versions/yank`);
      expect(world.requests[0]).toMatchObject({
        method: "POST",
        body: { selection: "all-available" },
      });
      expect(transition.affectedVersions).toEqual(["1.0.0", "1.2.3"]);
      expect(transition.message).toContain("2 available versions");
      expect(transition.message).toContain("Future versions are unaffected");
    }),
  );

  for (const ref of [registryTarget, `${registryTarget}@^1.2.3`, `${registryTarget}@*`]) {
    it.effect(`rejects ${ref} without an exact selection before contacting the Registry`, () =>
      Effect.gen(function* () {
        const world = makeRegistryManagementWorld(() => {
          throw new Error("Invalid selection must not contact the Registry");
        });

        const failure = yield* world.provide(
          withAuthPorts(Effect.flip(yank({ ref, allVersions: false, verification }))),
        );

        expect(expectPublishFailed(failure).category).toBe("validation");
        expect(world.requests).toEqual([]);
      }),
    );
  }
});
