import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { makeSyncFixture, previewSync } from "../testing/sync-fixture.js";
import { syncRequest } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/sync/invalid-selectors-name-the-fqn-shape",
  title: "Sync distinguishes malformed selectors from absent extensions",
  statement:
    "Sync shall reject a malformed target with a validation diagnostic naming @owner/type/name and suggesting axm list, without changing workspace state. A valid fully qualified name absent from desired state shall remain not_found.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync selector diagnostics", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const target of [
    "review",
    "skills/review",
    "@acme/skill/review",
    "@acme/skills/review/extra",
    "@acme/skills/absent",
  ]) {
    it.effect(`classifies ${target} without writes`, () => {
      const workspace = makeSyncFixture({ settings: { owner: "@acme", agents: ["claude-code"] } });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const failure = yield* Effect.flip(
              previewSync(syncRequest({ target: Option.some(target) })),
            );
            expect(failure).toMatchObject({
              _tag: "WorkspaceSyncFailed",
              category: target === "@acme/skills/absent" ? "not_found" : "validation",
            });
            if (target !== "@acme/skills/absent") {
              expect(failure).toMatchObject({
                detail: expect.stringContaining("@owner/type/name"),
                suggestions: [{ cmd: "axm list", description: expect.any(String) }],
              });
            }
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
