import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { ArchivalTransitionSchema } from "@agentxm/registry-protocol/unstable/registry";

import { unarchive } from "../lifecycle/archival.js";
import {
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  observedRevision,
  registryProblem,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/unarchive/restores-at-the-observed-revision",
  title: "Unarchive uses the observed revision",
  statement:
    "The unarchive command shall read the selected extension's archival revision, use that exact revision as the removal precondition, and report either the acknowledged restoration or the Registry's rejected precondition without replaying the write.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/lifecycle/command.ts",
    "packages/core/workspace/src/publishing/lifecycle/archival.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional extension unarchive", () => {
  const before = { archivedAt: "2026-09-19T00:00:00.000Z", reason: "No longer maintained" };
  const transition = {
    target: registryTarget,
    before,
    after: null,
    disposition: "restored",
    revision: "opaque-new-revision",
  };

  for (const rejected of [false, true]) {
    it.effect(rejected ? "does not replay a rejected precondition" : "restores archival", () => {
      const world = makeRegistryManagementWorld((request) =>
        request.method === "GET"
          ? jsonRegistryResponse({ archival: before, revision: observedRevision })
          : rejected
            ? registryProblem("conflict", 412)
            : jsonRegistryResponse(transition),
      );

      return Effect.gen(function* () {
        const outcome = yield* world.provide(unarchive(registryTarget).pipe(Effect.exit));

        expect(outcome._tag).toBe(rejected ? "Failure" : "Success");
        expect(world.requests.map(({ method }) => method)).toEqual(["GET", "DELETE"]);
        expect(
          world.requests.every(({ url }) => url.pathname === `${registryTargetPath}/archival`),
        ).toBe(true);
        expect(world.requests[1]?.ifMatch).toBe(observedRevision);
        if (!rejected && outcome._tag === "Success") {
          expect(
            yield* Schema.encodeUnknownEffect(ArchivalTransitionSchema)(outcome.value.transition),
          ).toEqual(transition);
        }
      });
    });
  }
});
