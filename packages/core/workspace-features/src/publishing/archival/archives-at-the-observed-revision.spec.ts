import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { ArchivalTransitionSchema } from "@agentxm/registry-protocol/unstable/registry";

import { archive } from "../lifecycle/archival.js";
import {
  expectPublishFailed,
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
    "The archive command shall read the selected extension's archival revision, condition its write on that exact revision, normalize a supplied public message, preserve it on omission, clear it only on explicit clearing, reject setting and clearing together as a usage error before Registry access, and report the Registry's acknowledged transition.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "actionable-diagnostics"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/lifecycle/command.ts",
    "packages/core/workspace-features/src/publishing/lifecycle/archival.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional extension archival", () => {
  it.effect("archives with the observed revision and acknowledged public message", () => {
    const transition = {
      target: registryTarget,
      before: null,
      after: { archivedAt: "2026-09-19T00:00:00.000Z", message: "No longer maintained" },
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
        archive({
          ref: registryTarget,
          message: Option.some("  No longer maintained  "),
          clearMessage: false,
        }),
      );

      expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
      expect(
        world.requests.every(({ url }) => url.pathname === `${registryTargetPath}/archival`),
      ).toBe(true);
      expect(world.requests[1]).toMatchObject({
        ifMatch: observedRevision,
        body: { message: "No longer maintained" },
      });
      expect(
        yield* Schema.encodeUnknownEffect(ArchivalTransitionSchema)(outcome.transition),
      ).toEqual(transition);
    });
  });

  for (const row of [
    {
      label: "omits the message to preserve it",
      message: Option.none<string>(),
      clearMessage: false,
      body: {},
      afterMessage: "Existing guidance",
      disposition: "unchanged",
    },
    {
      label: "clears the message explicitly",
      message: Option.none<string>(),
      clearMessage: true,
      body: { message: null },
      afterMessage: undefined,
      disposition: "edited",
    },
    {
      label: "normalizes an explicitly blank message to clearing",
      message: Option.some("  "),
      clearMessage: false,
      body: { message: null },
      afterMessage: undefined,
      disposition: "edited",
    },
    {
      label: "replaces the message",
      message: Option.some("  New guidance  "),
      clearMessage: false,
      body: { message: "New guidance" },
      afterMessage: "New guidance",
      disposition: "edited",
    },
  ]) {
    it.effect(row.label, () => {
      const before = { archivedAt: "2026-09-19T00:00:00.000Z", message: "Existing guidance" };
      const transition = {
        target: registryTarget,
        before,
        after: {
          archivedAt: before.archivedAt,
          ...(row.afterMessage === undefined ? {} : { message: row.afterMessage }),
        },
        disposition: row.disposition,
        revision: "acknowledged-revision",
      };
      const world = makeRegistryManagementWorld((request) =>
        jsonRegistryResponse(
          request.method === "GET" ? { archival: before, revision: observedRevision } : transition,
        ),
      );
      return Effect.gen(function* () {
        const outcome = yield* world.provide(
          archive({ ref: registryTarget, message: row.message, clearMessage: row.clearMessage }),
        );
        expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
        expect(world.requests[1]).toMatchObject({ ifMatch: observedRevision, body: row.body });
        expect(world.requests[1]?.body).toEqual(row.body);
        expect(
          yield* Schema.encodeUnknownEffect(ArchivalTransitionSchema)(outcome.transition),
        ).toEqual(transition);
      });
    });
  }

  it.effect("refuses setting and clearing together before any Registry request", () => {
    const world = makeRegistryManagementWorld(() => {
      throw new Error("Conflicting message intents must not contact the Registry");
    });
    return Effect.gen(function* () {
      const failure = yield* world.provide(
        archive({
          ref: registryTarget,
          message: Option.some("New guidance"),
          clearMessage: true,
        }).pipe(Effect.flip),
      );
      expect(expectPublishFailed(failure).category).toBe("usage");
      expect(world.requests).toEqual([]);
    });
  });
});
