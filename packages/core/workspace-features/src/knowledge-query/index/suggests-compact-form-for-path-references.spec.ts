import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/suggests-compact-form-for-path-references",
  title: "A path-style reference to an installed concept suggests its compact form",
  statement:
    "When a concept reference writes its concept ID as a path after the bundle identity and that concept is installed, AXM shall still report not found and shall suggest the same identity in its compact # form.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production Knowledge resolution discovers and reads authored documents from a native temporary workspace; the suggestion depends on the installed corpus, not on the reference's syntax alone.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/knowledge/concepts/resolve.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const withCorpus = () =>
  makeKnowledgeFixtureWorkspace({
    bundles: [
      {
        name: "platform",
        documents: { "guides/sessions.md": knowledgeDocument("# Sessions\n") },
      },
    ],
  });

const resolveIn = (input: string) => {
  const workspace = withCorpus();
  return workspace
    .provide(KnowledgeDiscovery.resolve({ input }))
    .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(workspace.cleanup)));
};

describe("Path-style concept reference", () => {
  it.effect("names the installed concept's compact form without resolving it", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveIn("@acme/knowledge/platform/guides/sessions");
      expect(resolved).toMatchObject({
        outcome: "not-found",
        document: { outcome: "not-found" },
        compactForm: "@acme/knowledge/platform#guides/sessions",
      });
    }),
  );

  it.effect("suggests nothing when no installed concept has that identity", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveIn("@acme/knowledge/platform/guides/session");
      expect(resolved).toEqual({ outcome: "not-found", document: { outcome: "not-found" } });
    }),
  );
});
