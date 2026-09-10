import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { captureInstalledKnowledgeCorpus } from "./installed-corpus.js";
import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import {
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
  withChangingKnowledgeReads,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/refuses-changing-corpus",
  title: "Discovery refuses an unstable source view",
  statement:
    "When Knowledge source bytes continue changing during capture, AXM shall report a corpus-changing conflict instead of returning results from an inconsistent source view.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/knowledge-query/src/knowledge-capture.test.ts",
    "packages/core/knowledge-query/src/knowledge-revision.test.ts",
    "packages/core/knowledge-query/src/corpus/installed-corpus.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const reference = "@acme/knowledge/platform#session";

describe("Changing Knowledge source", () => {
  it.effect("refuses one capture whose sources keep changing", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const captured = yield* withChangingKnowledgeReads(captureInstalledKnowledgeCorpus());
          expect(captured).toEqual({ outcome: "corpus-changing" });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  // Every discovery operation shares that one capture entry point.
  it.effect("get", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(KnowledgeDiscovery.get({ reference }));
          expect(result.outcome).toBe("corpus-changing");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("search", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(
            KnowledgeDiscovery.search({ scope: "project", expression: "session" }),
          );
          expect(result.outcome).toBe("corpus-changing");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("query", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(
            KnowledgeDiscovery.query({ scope: "project" }),
          );
          expect(result.outcome).toBe("corpus-changing");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("resolve", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(
            KnowledgeDiscovery.resolve({ input: reference }),
          );
          expect(result.outcome).toBe("corpus-changing");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("related", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(
            KnowledgeDiscovery.related({ reference }),
          );
          expect(result.outcome).toBe("corpus-changing");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});
