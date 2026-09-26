import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { ArchivalTransitionSchema } from "@agentxm/registry-protocol/unstable/registry";

import { archive } from "../lifecycle/archival.js";
import {
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  observedRevision,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/archive/archives-at-the-observed-revision",
  title: "Archival uses the observed revision",
  statement:
    "The archive command shall read the selected extension's archival revision, condition its write on that exact revision, normalize optional public reasoning, and report the Registry's acknowledged transition.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "actionable-diagnostics"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/lifecycle/command.ts",
    "packages/core/workspace/src/publishing/lifecycle/archival.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional extension archival", () => {
  it.effect("archives with the observed revision and acknowledged public reason", () => {
    const transition = {
      target: registryTarget,
      before: null,
      after: { archivedAt: "2026-09-19T00:00:00.000Z", reason: "No longer maintained" },
      disposition: "created",
      revision: "opaque-new-revision",
    };
    const world = makeRegistryManagementWorld((request) =>
      jsonRegistryResponse(
        request.method === "GET" ? { archival: null, revision: observedRevision } : transition,
      ),
    );

    return Effect.gen(function* () {
      const outcome = yield* world.provide(
        archive({ ref: registryTarget, reason: Option.some("  No longer maintained  ") }),
      );

      expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
      expect(
        world.requests.every(({ url }) => url.pathname === `${registryTargetPath}/archival`),
      ).toBe(true);
      expect(world.requests[1]).toMatchObject({
        ifMatch: observedRevision,
        body: { reason: "No longer maintained" },
      });
      expect(
        yield* Schema.encodeUnknownEffect(ArchivalTransitionSchema)(outcome.transition),
      ).toEqual(transition);
    });
  });
});
